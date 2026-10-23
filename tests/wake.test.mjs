import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {wakeIntent} from '../src/wake-policy.js'
test('solo activa solicitudes dirigidas a Bimu y permite una segunda frase armada',()=>{
 assert.deepEqual(wakeIntent('Hola Bimu, abrí Spotify.'),{kind:'request',text:'abrí Spotify.'})
 assert.deepEqual(wakeIntent('Oye Bimu'),{kind:'arm'})
 assert.deepEqual(wakeIntent('abrí Spotify'),{kind:'ignore'})
 assert.deepEqual(wakeIntent('hablamos de Bimu y Spotify'),{kind:'ignore'})
 assert.deepEqual(wakeIntent('Bimusic abrí Spotify'),{kind:'ignore'})
 assert.deepEqual(wakeIntent('Abrí Calculadora',true),{kind:'request',text:'Abrí Calculadora'})
 assert.deepEqual(wakeIntent('Bimu, cancelá.'),{kind:'cancel'})
})
function processor(config={}){let Processor;const messages=[];const context=vm.createContext({Float32Array,Math,Number,sampleRate:16000,AudioWorkletProcessor:class{constructor(){this.port={postMessage:m=>messages.push(m)}}},registerProcessor:(_,klass)=>Processor=klass});vm.runInContext(readFileSync(new URL('../public/wake-processor.js',import.meta.url),'utf8'),context);const p=new Processor();p.port.onmessage({data:{type:'config',enabled:true,threshold:.008,...config}});const feed=(seconds,volume)=>{for(let n=0;n<Math.ceil(seconds*16000/128);n++)p.process([[new Float32Array(128).fill(volume)]],[[new Float32Array(128)]])};return {p,messages,feed}}
test('VAD no envía silencio, conserva pre-roll y cierra una frase al terminar de hablar',()=>{
 const {messages,feed}=processor();feed(2,0);assert.equal(messages.length,0);feed(.6,.1);feed(1.4,0);const result=messages.find(m=>m.type==='utterance');assert.ok(result);assert.equal(result.clipped,false);assert.ok(result.samples.length<=16000*2.5);assert.ok(result.samples.some(s=>s>.05));const count=messages.length;feed(2,.1);assert.equal(messages.length,count,'espera reactivación mientras se transcribe')
})
test('pausar descarta la frase y limita audio continuo a quince segundos',()=>{
 const {p,messages,feed}=processor();feed(.4,.1);p.port.onmessage({data:{type:'config',enabled:false}});feed(2,0);assert.equal(messages.some(m=>m.type==='utterance'),false);p.port.onmessage({data:{type:'config',enabled:true}});feed(16,.1);assert.equal(messages.find(m=>m.type==='utterance').clipped,true)
})
test('maximum sensitivity detects quiet speech below the previous minimum while rejecting quieter background',()=>{
 const {messages,feed}=processor({threshold:.0005,silenceMs:700})
 feed(1,.0001);assert.equal(messages.length,0)
 feed(.4,.0012);feed(.8,.0001)
 assert.equal(messages.filter(m=>m.type==='speech').length,1);assert.equal(messages.filter(m=>m.type==='utterance').length,1)
})
test('calibration measures noise without transmitting speech and closes utterances over the same steady noise',()=>{
 const {p,messages,feed}=processor({threshold:.0005,silenceMs:700})
 p.port.onmessage({data:{type:'calibrate'}});feed(2.1,.0008)
 const result=messages.find(m=>m.type==='calibrated');assert.ok(result);assert.ok(Math.abs(result.noiseFloor-.0008)<1e-7);assert.equal(result.tooNoisy,false);assert.equal(messages.some(m=>m.type==='utterance'||m.type==='speech'),false)
 p.port.onmessage({data:{type:'config',enabled:true,threshold:.0005,silenceMs:700,noiseFloor:result.noiseFloor}})
 feed(.8,.0008);assert.equal(messages.some(m=>m.type==='speech'),false)
 feed(.4,.002);feed(.8,.0008);assert.equal(messages.filter(m=>m.type==='utterance').length,1)
})
test('loud calibration is flagged and canceling calibration never emits its buffered audio',()=>{
 const h=processor();h.p.port.onmessage({data:{type:'calibrate'}});h.feed(2.1,.04);assert.equal(h.messages.find(m=>m.type==='calibrated').tooNoisy,true)
 const c=processor();c.p.port.onmessage({data:{type:'calibrate'}});c.feed(.7,.001);c.p.port.onmessage({data:{type:'cancel-calibration'}});c.feed(2,0)
 assert.equal(c.messages.some(m=>m.type==='calibrated'||m.type==='utterance'),false)
})
test('meter reports aggregate levels while paused, at a bounded rate, without forwarding audio',()=>{
 const {messages,feed}=processor({enabled:false,meter:true});feed(1,.0007)
 assert.equal(messages.length,5);assert.ok(messages.every(m=>m.type==='level'&&Number.isFinite(m.rms)&&!('samples' in m)))
})

test('conserva una pausa natural sin separar el nombre del comando',()=>{
 const {messages,feed}=processor();feed(.3,.1);feed(1,0);assert.equal(messages.some(m=>m.type==='utterance'),false);feed(.6,.1);feed(1.4,0);assert.equal(messages.filter(m=>m.type==='utterance').length,1)
})
test('no abre aplicaciones a partir de las transcripciones ambiguas reportadas',()=>{
 for(const text of ['A ver, blok de notas.','Avilir es Spotify.','A abrir calculadora.','Avedir, vlog de Notas.'])assert.deepEqual(wakeIntent(text),{kind:'ignore'})
})
function applicationsHarness(invoke){
 const slots=[];let cursor=0;const effects=[],recorded=[]
 const context=vm.createContext({useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}]},useRef:initial=>{const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},useEffect:fn=>effects.push(fn),invoke,registeredLaunch:(_items,t)=>/^abrí /.test(t)})
 const code=readFileSync(new URL('../src/useApplications.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace('export function','function')
 vm.runInContext(code+';globalThis.hook=useApplications',context)
 const render=()=>{cursor=0;return context.hook({native:true,onResult:(...args)=>recorded.push(args)})}
 let app=render();effects.splice(0).forEach(fn=>fn());return {render,app,recorded}
}
test('las aperturas manos libres no escriben historial; texto mantiene su registro',async()=>{
 const h=applicationsHarness(async command=>command==='apps_list'?[]:{status:'opened',name:'Spotify'}),notices=[]
 await h.app.request('abrí Spotify',{silent:true,onFeedback:(...args)=>notices.push(args)})
 assert.equal(h.recorded.length,0);assert.equal(notices[0][0],'success')
 await h.app.request('abrí Spotify');assert.equal(h.recorded.length,1)
})
test('confirmar y cancelar voz tampoco escribe historial; fallos notifican sin simular éxito',async()=>{
 let fail=false
 const h=applicationsHarness(async command=>{if(command==='apps_list')return [];if(command==='apps_request')return {status:'confirm',id:1,name:'Spotify'};if(command==='apps_confirm'){if(fail)throw Error('No instalada');return 'Spotify'}})
 await h.app.request('abrí Spotify',{silent:true});assert.equal(h.render().pending.silent,true);assert.equal(await h.app.confirm(false),true);assert.equal(h.recorded.length,0)
 await h.app.request('abrí Spotify',{silent:true});await h.app.cancel();assert.equal(h.recorded.length,0)
 await h.app.request('abrí Spotify',{silent:true});fail=true;assert.equal(await h.app.confirm(false),false);assert.equal(h.recorded.length,0)
})


test('espera rápida segmenta antes y pausas largas conserva una pausa de 1,4 segundos',()=>{
 const fast=processor();fast.p.port.onmessage({data:{type:'config',enabled:true,silenceMs:700}});fast.feed(.4,.1);fast.feed(.8,0);assert.equal(fast.messages.filter(m=>m.type==='utterance').length,1)
 const slow=processor();slow.p.port.onmessage({data:{type:'config',enabled:true,silenceMs:1600}});slow.feed(.4,.1);slow.feed(1.4,0);assert.equal(slow.messages.some(m=>m.type==='utterance'),false);slow.feed(.4,.1);slow.feed(1.7,0);assert.equal(slow.messages.filter(m=>m.type==='utterance').length,1)
})
test('mediciones agregadas no conservan transcripciones y distinguen resultados',async()=>{
 const {emptyWakeMetrics,addWakeMetric}=await import('../src/wake-metrics.js')
 let s=emptyWakeMetrics();for(const kind of ['arm','request','ignore','error','clipped'])s=addWakeMetric(s,{kind,audioMs:1000,processingMs:250,text:'privado'})
 assert.equal(s.count,5);assert.equal(s.activated,2);assert.equal(s.ignored,1);assert.equal(s.errors,1);assert.equal(s.clipped,1);assert.equal(s.audioMs,5000);assert.equal(s.processingMs,1250);assert.equal(s.maxMs,250);assert.equal('text' in s,false)
})
test('configuración local tolera datos inválidos y respeta los límites',async()=>{
 const {loadWakeSettings}=await import('../src/wake-metrics.js')
 const original=globalThis.localStorage
 try{
  globalThis.localStorage={getItem:()=>'{oops'};assert.deepEqual(loadWakeSettings(),{threshold:.008,silenceMs:1200,calibration:null})
  globalThis.localStorage={getItem:()=>JSON.stringify({threshold:1,silenceMs:700})};assert.deepEqual(loadWakeSettings(),{threshold:.025,silenceMs:700,calibration:null})
  globalThis.localStorage={getItem:()=>JSON.stringify({threshold:.002,silenceMs:700})};assert.equal(loadWakeSettings().threshold,.0005,'old maximum sensitivity migrates to the wider range')
  globalThis.localStorage={getItem:()=>JSON.stringify({version:2,threshold:.002,calibration:{device:'mic',noiseFloor:.0007}})};assert.deepEqual(loadWakeSettings().calibration,{device:'mic',noiseFloor:.0007});assert.equal(loadWakeSettings().threshold,.002)
  globalThis.localStorage={getItem:()=>JSON.stringify({calibration:{device:'mic',noiseFloor:Infinity}})};assert.equal(loadWakeSettings().calibration,null)
 }finally{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original}
})

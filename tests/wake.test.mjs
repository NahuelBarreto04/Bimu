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
function processor(){let Processor;const messages=[];const context=vm.createContext({Float32Array,Math,Number,sampleRate:16000,AudioWorkletProcessor:class{constructor(){this.port={postMessage:m=>messages.push(m)}}},registerProcessor:(_,klass)=>Processor=klass});vm.runInContext(readFileSync(new URL('../public/wake-processor.js',import.meta.url),'utf8'),context);const p=new Processor();p.port.onmessage({data:{type:'config',enabled:true,threshold:.008}});const feed=(seconds,volume)=>{for(let n=0;n<Math.ceil(seconds*16000/128);n++)p.process([[new Float32Array(128).fill(volume)]],[[new Float32Array(128)]])};return {p,messages,feed}}
test('VAD no envía silencio, conserva pre-roll y cierra una frase al terminar de hablar',()=>{
 const {messages,feed}=processor();feed(2,0);assert.equal(messages.length,0);feed(.6,.1);feed(1.4,0);const result=messages.find(m=>m.type==='utterance');assert.ok(result);assert.equal(result.clipped,false);assert.ok(result.samples.length<=16000*2.5);assert.ok(result.samples.some(s=>s>.05));const count=messages.length;feed(2,.1);assert.equal(messages.length,count,'espera reactivación mientras se transcribe')
})
test('pausar descarta la frase y limita audio continuo a quince segundos',()=>{
 const {p,messages,feed}=processor();feed(.4,.1);p.port.onmessage({data:{type:'config',enabled:false}});feed(2,0);assert.equal(messages.some(m=>m.type==='utterance'),false);p.port.onmessage({data:{type:'config',enabled:true}});feed(16,.1);assert.equal(messages.find(m=>m.type==='utterance').clipped,true)
})

test('conserva una pausa natural sin separar el nombre del comando',()=>{
 const {messages,feed}=processor();feed(.3,.1);feed(1,0);assert.equal(messages.some(m=>m.type==='utterance'),false);feed(.6,.1);feed(1.4,0);assert.equal(messages.filter(m=>m.type==='utterance').length,1)
})
test('no abre aplicaciones a partir de las transcripciones ambiguas reportadas',()=>{
 for(const text of ['A ver, blok de notas.','Avilir es Spotify.','A abrir calculadora.','Avedir, vlog de Notas.'])assert.deepEqual(wakeIntent(text),{kind:'ignore'})
})
function applicationsHarness(invoke){
 const slots=[];let cursor=0;const effects=[],recorded=[]
 const context=vm.createContext({useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}]},useRef:initial=>{const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},useEffect:fn=>effects.push(fn),invoke,looksLikeLaunch:t=>/^abrí /.test(t)})
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

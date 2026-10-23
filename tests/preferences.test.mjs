import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {readOpacity} from '../src/ui-preferences.js'
import {loadWakeSettings,emptyWakeMetrics,addWakeMetric} from '../src/wake-metrics.js'
import {wakeIntent,ARM_WINDOW_MS} from '../src/wake-policy.js'
function clock(){
 let now=0,next=0;const tasks=new Map()
 return {setTimeout:(fn,delay)=>{tasks.set(++next,{fn,at:now+delay});return next},clearTimeout:id=>tasks.delete(id),advance:async ms=>{const end=now+ms;while(true){const due=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;tasks.delete(due[0]);now=due[1].at;await due[1].fn();await flush()}now=end},now:()=>now}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve))
function target(){const handlers=new Map();return {addEventListener:(type,fn)=>{if(!handlers.has(type))handlers.set(type,new Set());handlers.get(type).add(fn)},removeEventListener:(type,fn)=>handlers.get(type)?.delete(fn),emit:type=>{for(const fn of handlers.get(type)||[])fn()}}}
function hooks(file,name,globals,props){
 const slots=[],effects=[];let cursor=0
 const context=vm.createContext({...globals,useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}]},useRef:initial=>{const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},useCallback:(fn,deps)=>{const i=cursor++;if(!slots[i]||deps.some((d,j)=>d!==slots[i].deps[j]))slots[i]={fn,deps};return slots[i].fn},useEffect:(fn,deps)=>{const i=cursor++;if(!slots[i]||deps.some((d,j)=>d!==slots[i].deps[j])){const previous=slots[i];slots[i]={deps};effects.push(()=>{previous?.cleanup?.();slots[i].cleanup=fn()})}}})
 const source=readFileSync(new URL(file,import.meta.url),'utf8').replace(/^import .*$/gm,'').replaceAll('export ','')
 vm.runInContext(source+`;globalThis.hook=${name}`,context)
 return {render:()=>{cursor=0;const result=context.hook(props);effects.splice(0).forEach(fn=>fn());return result},dispose:()=>slots.forEach(s=>s?.cleanup?.())}
}
function wakeHarness({preferred=false,hidden=false,status=async()=>{},permission=async()=>({getTracks:()=>[{stop(){}}]})}={}){
 const time=clock(),doc={...target(),hidden,baseURI:'http://bimu.local/'};const storage=new Map([['bimu-wake-enabled',String(preferred)]]),events={},nodes=[];let permissions=0,activity=0,transcript='Hola sin activar'
 const globals={...time,document:doc,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},loadWakeSettings:()=>({silenceMs:700,threshold:.008}),emptyWakeMetrics,addWakeMetric,wakeIntent,ARM_WINDOW_MS,performance:{now:time.now},crypto:{randomUUID:()=> 'request'},URL,Date,pcmToWav:async()=>new Uint8Array([1]),normalizeTranscript:s=>s,microphoneError:e=>e.message,invoke:async cmd=>cmd==='voice_status'?status():cmd==='voice_transcribe'?transcript:null,listen:async(event,fn)=>{events[event]=fn;return ()=>delete events[event]},navigator:{mediaDevices:{getUserMedia:async()=>{permissions++;return permission()}}},AudioContext:class{constructor(){this.audioWorklet={addModule:async()=>{}};this.destination={}}resume(){return Promise.resolve()}close(){return Promise.resolve()}createMediaStreamSource(){return {connect(){},disconnect(){}}}createGain(){return {gain:{},connect(){},disconnect(){}}}},AudioWorkletNode:class{constructor(){this.port={postMessage(){}};nodes.push(this)}connect(){}disconnect(){}}}
 const props={native:true,busy:false,device:'',monitor:true,onRequest:async()=>{},onActivity:()=>activity++}
 const h=hooks('../src/useWakeListener.js','useWakeListener',globals,props)
 return {...h,time,doc,storage,events,nodes,props,get permissions(){return permissions},get activity(){return activity},set transcript(value){transcript=value}}
}
test('opacity restores a bounded preference and tolerates invalid storage',()=>{
 const original=globalThis.localStorage
 try{for(const [saved,expected]of [[null,90],['',90],['NaN',90],['20',35],['150',100],['55',55]]){globalThis.localStorage={getItem:()=>saved};assert.equal(readOpacity(),expected)}globalThis.localStorage={getItem:()=>{throw Error()}};assert.equal(readOpacity(),90)}finally{globalThis.localStorage=original}
})
test('rest occurs after ten minutes, interaction wakes and restarts it, busy work delays it',async()=>{
 const time=clock(),surface=target();let sleeps=0,wakes=0
 const props={enabled:true,busy:false,onRest:()=>sleeps++,onWake:()=>wakes++}
 const h=hooks('../src/useIdleRest.js','useIdleRest',{...time,document:{querySelector:()=>surface}},props)
 const activity=h.render();await time.advance(599999);assert.equal(sleeps,0);await time.advance(1);assert.equal(sleeps,1)
 surface.emit('pointerdown');assert.equal(wakes,1);await time.advance(599999);assert.equal(sleeps,1)
 activity();await time.advance(1);assert.equal(sleeps,1)
 props.busy=true;h.render();await time.advance(600000);assert.equal(sleeps,1)
 props.busy=false;h.render();await time.advance(600000);assert.equal(sleeps,2)
 h.dispose();await time.advance(600000);assert.equal(sleeps,2)
})
test('saved wake choice restores after engine startup; disabling persists across reopen',async()=>{
 let calls=0;const h=wakeHarness({preferred:true,status:async()=>{if(++calls===1)throw Error('cargando')}})
 h.render();await flush();assert.equal(h.permissions,0);await h.time.advance(3000);await flush();assert.equal(h.render().enabled,true);assert.equal(h.permissions,1)
 h.render().stop();assert.equal(h.storage.get('bimu-wake-enabled'),'false');h.dispose()
 const next=wakeHarness({preferred:false});next.render();await flush();assert.equal(next.permissions,0);next.dispose()
})
test('hiding pauses without forgetting preference; showing restores; manual off prevents restoration',async()=>{
 const h=wakeHarness();h.render();await h.render().start();assert.equal(h.storage.get('bimu-wake-enabled'),'true')
 h.doc.hidden=true;h.doc.emit('visibilitychange');assert.equal(h.render().enabled,false);assert.equal(h.storage.get('bimu-wake-enabled'),'true')
 h.doc.hidden=false;h.doc.emit('visibilitychange');await flush();assert.equal(h.render().enabled,true)
 h.render().stop();h.events['desktop-action']?.();await flush();assert.equal(h.render().enabled,false);assert.equal(h.storage.get('bimu-wake-enabled'),'false');h.dispose()
})
test('permission failures preserve preference and do not repeatedly request the microphone',async()=>{
 const h=wakeHarness({preferred:true,permission:async()=>{throw Error('Permiso denegado')}});h.render();await flush()
 assert.equal(h.render().enabled,false);assert.match(h.render().error,/Permiso/);assert.equal(h.storage.get('bimu-wake-enabled'),'true')
 await h.time.advance(90000);assert.equal(h.permissions,1);h.dispose()
})
test('only a recognized Bimu invocation wakes the animation; ambient phrases do not',async()=>{
 const h=wakeHarness();h.render();await h.render().start()
 const send=async text=>{h.transcript=text;h.nodes.at(-1).port.onmessage({data:{type:'utterance',samples:new Float32Array(16000),rate:16000}});await flush()}
 await send('Hola sin activar');assert.equal(h.activity,0)
 await send('Bimu');assert.equal(h.activity,1);assert.equal(h.render().enabled,true);h.dispose()
})
test('canceling restoration while engine readiness is pending cannot open microphone later',async()=>{
 let ready;const h=wakeHarness({preferred:true,status:()=>new Promise(resolve=>ready=resolve)});h.render();h.render().stop();ready();await flush();assert.equal(h.permissions,0);assert.equal(h.render().enabled,false);h.dispose()
})

test('saved listening starts when the initially hidden native surface becomes ready',async()=>{
 const h=wakeHarness({preferred:true,hidden:true});h.render();await flush();assert.equal(h.permissions,0)
 h.doc.hidden=false;h.doc.emit('bimu-surface-ready');await flush();assert.equal(h.render().enabled,true);assert.equal(h.permissions,1);h.dispose()
})
test('update suspension retains listening preference and the next launch restores it',async()=>{
 const h=wakeHarness({preferred:true});h.render();await flush();h.events['bimu-voice-cancel']();assert.equal(h.render().enabled,false);assert.equal(h.storage.get('bimu-wake-enabled'),'true');h.dispose()
 const next=wakeHarness({preferred:true});next.render();await flush();assert.equal(next.render().enabled,true);next.dispose()
})
test('boot recovery tolerates an engine taking more than a minute to become ready',async()=>{
 const h=wakeHarness({preferred:true,status:async()=>{if(h.time.now()<70000)throw Error('Cargando motor')}});h.render();await flush();await h.time.advance(75000);await flush();assert.equal(h.render().enabled,true);assert.equal(h.permissions,1);h.dispose()
})
test('automatic launch greets only after visibility, once, and startup can be explicitly disabled',async()=>{
 const time=clock(),doc={...target(),hidden:true},calls=[];let greetings=0
 const h=hooks('../src/useStartup.js','useStartup',{...time,document:doc,invoke:async(cmd,args)=>{calls.push({cmd,args});return {enabled:cmd==='startup_set'?args.enabled:true,supported:true,automaticLaunch:true}}},{native:true,listenPreferred:true,onGreeting:()=>greetings++})
 h.render();await flush();h.render();await time.advance(1000);assert.equal(greetings,0)
 doc.hidden=false;doc.emit('bimu-surface-ready');await time.advance(600);assert.equal(greetings,1)
 doc.emit('visibilitychange');await time.advance(1000);assert.equal(greetings,1)
 await h.render().setEnabled(false);assert.equal(h.render().status.enabled,false);assert.equal(calls[0].args.listenPreferred,true);assert.equal(calls.at(-1).cmd,'startup_set');h.dispose()
})
test('manual launch does not show the automatic startup greeting',async()=>{
 const time=clock(),doc={...target(),hidden:false};let greetings=0
 const h=hooks('../src/useStartup.js','useStartup',{...time,document:doc,invoke:async()=>({enabled:true,supported:true,automaticLaunch:false})},{native:true,listenPreferred:true,onGreeting:()=>greetings++})
 h.render();await flush();h.render();await time.advance(2000);assert.equal(greetings,0);h.dispose()
})
test('calibration persists per microphone and level telemetry never changes the wake preference',async()=>{
 const h=wakeHarness();h.render();await h.render().start();h.render().calibrate()
 assert.equal(h.render().calibrating,true);assert.equal(h.render().phase,'calibrating')
 await h.nodes.at(-1).port.onmessage({data:{type:'level',rms:.0008,peak:.001,threshold:.002,speaking:false,calibrationProgress:.5}})
 assert.equal(h.render().level.progress,.5);assert.equal(h.storage.get('bimu-wake-enabled'),'true')
 await h.nodes.at(-1).port.onmessage({data:{type:'calibrated',noiseFloor:.0007,tooNoisy:false}})
 assert.equal(h.render().calibrated,true);assert.equal(h.render().phase,'listening');assert.equal(h.render().calibrating,false)
 assert.equal(JSON.parse(h.storage.get('bimu-wake-settings')).calibration.noiseFloor,.0007)
 h.render().stop();h.props.device='other-mic';assert.equal(h.render().calibrated,false)
 await h.render().start();assert.equal(h.render().enabled,true);h.dispose()
})
test('busy operation interrupts calibration and late calibration data cannot change the saved noise floor',async()=>{
 const h=wakeHarness();h.render();await h.render().start();h.render().calibrate();h.props.busy=true;h.render()
 assert.equal(h.render().calibrating,false);assert.equal(h.render().phase,'paused')
 await h.nodes.at(-1).port.onmessage({data:{type:'calibrated',noiseFloor:.001,tooNoisy:false}})
 assert.equal(h.render().calibrated,false);h.props.busy=false;assert.equal(h.render().phase,'paused');assert.equal(h.render().phase,'listening');h.dispose()
})
test('canceling or hiding during calibration preserves the previous listening choice',async()=>{
 const h=wakeHarness();h.render();await h.render().start();h.render().calibrate();h.render().cancelCalibration()
 assert.equal(h.render().calibrating,false);assert.equal(h.render().enabled,true);assert.equal(h.render().phase,'listening')
 h.render().calibrate();h.doc.hidden=true;h.doc.emit('visibilitychange');assert.equal(h.render().calibrating,false);assert.equal(h.storage.get('bimu-wake-enabled'),'true');h.dispose()
})

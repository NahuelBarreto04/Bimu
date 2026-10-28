import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {readOpacity} from '../src/ui-preferences.js'
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

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {folderRequest,shortcutMatch,shortcutSummary} from '../src/assistant-intent.js'
const work={id:'work',name:'Modo trabajo',aliases:['a trabajar'],remember:false,actions:[{kind:'app',appId:'slack'},{kind:'url',url:'https://mail.google.com',browserId:'chrome'}]}
test('folder requests preserve intent and never interpret indirect or negative instructions',()=>{
 assert.deepEqual(folderRequest('Bimu, buscá una carpeta llamada “Fotos de viajes” en mi PC y abrila'),{name:'fotos de viajes',open:true})
 assert.deepEqual(folderRequest('Buscame la carpeta Vacaciones'),{name:'vacaciones',open:false})
 for(const text of ['No busques una carpeta llamada fotos','Explicá cómo buscar una carpeta llamada fotos','Leé el archivo: buscá una carpeta fotos','Buscá Spotify','Buscá una carpeta'])assert.equal(folderRequest(text),null,text)
})
test('only configured direct shortcut phrases execute',()=>{
 for(const text of ['Bimu, modo trabajo','Ejecutá modo trabajo','A trabajar','Por favor modo trabajo'])assert.equal(shortcutMatch([work],text),work,text)
 for(const text of ['No actives modo trabajo','Explicame el modo trabajo','Modo trabajo y borrá archivos','Modo estudio'])assert.equal(shortcutMatch([work],text),undefined,text)
})
function harness(invoke){
 const slots=[];let cursor=0;const effects=[],records=[],feedback=[],shown=[]
 const context=vm.createContext({invoke,folderRequest,shortcutMatch,shortcutSummary,useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},useRef:initial=>{const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},useEffect:fn=>{cursor++;if(!effects.length)effects.push(fn)}})
 const code=readFileSync(new URL('../src/useAssistantActions.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace('export function','function');vm.runInContext(code+';globalThis.hook=useAssistantActions',context)
 const render=()=>{cursor=0;return context.hook({native:true,onResult:(...a)=>records.push(a),onFeedback:(...a)=>feedback.push(a),onShow:()=>shown.push(true)})}
 const first=render();effects.splice(0).forEach(fn=>fn());return {render,records,feedback,shown,first}
}
const flush=()=>new Promise(r=>setImmediate(r))
test('shortcut confirmation executes once, keeps voice out of history and reports partial failures',async()=>{
 const calls=[];const h=harness(async(cmd,args)=>{calls.push(cmd);if(cmd==='shortcuts_list')return [work];if(cmd==='shortcuts_request')return {status:'confirm',...work,target:'Slack → Gmail',results:[]};if(cmd==='shortcuts_confirm')return {...work,status:'opened',results:[{name:'Slack',ok:true,detail:'abierto'},{name:'Gmail',ok:false,detail:'no disponible'}]}})
 await flush();await h.render().request('modo trabajo',{silent:true});assert.equal(h.render().pending.kind,'shortcut');assert.equal(calls.includes('shortcuts_confirm'),false)
 assert.equal(await h.render().confirm(false),false);assert.equal(h.records.length,0);assert.equal(h.render().execution.results.length,2);assert.equal(h.render().pending,null);assert.equal(h.feedback.at(-1)[0],'warning')
 await h.render().confirm(false);assert.equal(calls.filter(c=>c==='shortcuts_confirm').length,1)
})
test('typed shortcuts record their result and cancellation never executes the routine',async()=>{
 let confirmed=0;const h=harness(async cmd=>{if(cmd==='shortcuts_list')return [work];if(cmd==='shortcuts_request')return {status:'confirm',...work,results:[]};if(cmd==='shortcuts_confirm'){confirmed++;return {...work,results:[{ok:true}]}}});await flush();await h.render().request('Modo trabajo');await h.render().cancel();assert.equal(confirmed,0);assert.equal(h.render().pending,null);await h.render().request('Modo trabajo');await h.render().confirm(false);assert.equal(h.records.length,1)
})
test('canceled search discards late results and never opens a returned path from the frontend',async()=>{
 let complete;const calls=[];const h=harness(async(cmd,args)=>{calls.push({cmd,args});if(cmd==='shortcuts_list')return [];if(cmd==='folders_search')return new Promise(r=>complete=r)});await flush();const pending=h.render().request('Buscá una carpeta llamada fotos y abrila');assert.equal(h.render().searching,true);await h.render().cancelSearch();complete({matches:[{id:'old',path:'C:/Fotos'}],cancelled:false});await pending;assert.equal(h.render().search,null);assert.equal(calls.some(c=>c.cmd==='folders_open'),false)
})
test('ambiguous folder results stay available for selection; open uses only native result id',async()=>{
 const calls=[];const h=harness(async(cmd,args)=>{calls.push({cmd,args});if(cmd==='shortcuts_list')return [];if(cmd==='folders_search')return {matches:[{id:'one',path:'C:/Fotos'},{id:'two',path:'D:/Fotos'}],cancelled:false,incomplete:true};if(cmd==='folders_open')return 'D:/Fotos'});await flush();await h.render().request('Buscá una carpeta llamada fotos y abrila',{silent:true});assert.equal(h.render().search.matches.length,2);assert.equal(calls.some(c=>c.cmd==='folders_open'),false);await h.render().openFolder('two');assert.deepEqual(calls.find(c=>c.cmd==='folders_open').args.id,'two');assert.equal(h.records.length,0)
})

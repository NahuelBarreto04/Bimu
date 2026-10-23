import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {registeredLaunch} from '../src/application-intent.js'
import {routeAssistantRequest} from '../src/assistant-routing.js'
import {createOllamaClient} from '../src/ollama-client.js'

test('unknown apps and general voice questions reach Ollama; saved commands stay direct',async()=>{
 const items=[{name:'Chrome',aliases:['Google Chrome']}],sent=[],direct=[],shown=[]
 const apps={isCommand:text=>registeredLaunch(items,text),request:async(...args)=>{direct.push(args);return true}}
 const ai={connected:true,model:'m',send:async(text,accepted)=>{sent.push(text);accepted?.();return true}}
 for(const text of ['Abrí Discord','¿Qué hora es en Jamaica?','Podés abrirme Slack por favor','Explicame qué es una nebulosa']){
  assert.equal(await routeAssistantRequest(text,{apps,ai,voice:true,onShowChat:()=>shown.push(true)}),true)
 }
 assert.equal(sent.length,4);assert.equal(direct.length,0);assert.equal(shown.length,4)
 await routeAssistantRequest('Abrí Google Chrome',{apps,ai,voice:true});assert.equal(direct.length,1);assert.equal(direct[0][1].silent,true);assert.equal(sent.length,4)
})
test('offline known shortcuts work and unknown voice requests explain the missing connection',async()=>{
 const feedback=[];let calls=0
 const ai={connected:false,model:'',send:async()=>{calls++;return false}}
 const apps={isCommand:t=>t==='Modo trabajo',request:async()=>true}
 assert.equal(await routeAssistantRequest('Modo trabajo',{apps,ai,voice:true}),true)
 assert.equal(await routeAssistantRequest('Abrí Discord',{apps,ai,voice:true,onFeedback:(...args)=>feedback.push(args)}),false)
 assert.equal(calls,0);assert.match(feedback[0][1],/Conectá Ollama/)
})
test('typed acceptance clears only accepted commands or prompts, never a failed request',async()=>{
 let accepted=0
 const apps={isCommand:()=>true,request:async()=> 'error'},ai={send:async()=>{throw Error('must not run')}}
 assert.equal(await routeAssistantRequest('Abrí Chrome',{apps,ai,onAccepted:()=>accepted++}),false);assert.equal(accepted,0)
 apps.request=async()=>true;await routeAssistantRequest('Abrí Chrome',{apps,ai,onAccepted:()=>accepted++});assert.equal(accepted,1)
})
test('tool activity and native proposals are validated and opening only sends a confirmation id',async()=>{
 const events=[],calls=[]
 const proposal={id:13,kind:'application',name:'Discord',target:'Windows · com.squirrel.Discord.Discord'}
 const client=createOllamaClient(async(command,args)=>{
  calls.push({command,args})
  if(command!=='ollama_chat_stream')return 'Se solicitó abrir Discord.'
  for(const name of ['get_current_time','search_applications','search_folders','open_application','open_folder'])args.onEvent.onmessage({type:'tool',name,path:'x',status:'done'})
  args.onEvent.onmessage({type:'action',proposal});args.onEvent.onmessage({type:'action',proposal:{...proposal,id:'13'}});args.onEvent.onmessage({type:'action',proposal:{...proposal,kind:'shell'}})
  return {content:'Confirmá el destino.',stopped:false}
 },()=>({}))
 await client.stream('r','m',[],()=>{},event=>events.push(event))
 assert.equal(events.length,6);assert.equal(events.at(-1).proposal.id,13);assert.equal(calls.length,1,'streaming never invokes the launch command from the client')
 await client.confirmAction(13);await client.cancelAction(13)
 assert.deepEqual(calls.slice(1),[{command:'autonomy_confirm',args:{id:13}},{command:'autonomy_cancel',args:{id:13}}])
})
function actionHarness(client){
 const state={messages:[],error:'',pending:{id:7,name:'Discord'}}
 const values={client,mounted:{current:true},lock:{current:false},proposal:{current:state.pending},setActionBusy:v=>state.busy=v,setActionProposal:v=>state.pending=v,setError:v=>state.error=v,setMessages:update=>state.messages=update(state.messages)}
 const source=readFileSync(new URL('../src/useOllama.js',import.meta.url),'utf8');const code=source.slice(source.indexOf('  const resolveAction=async'),source.indexOf('  const send=async'))
 const context=vm.createContext(values);vm.runInContext(code+';globalThis.resolveAction=resolveAction',context)
 return {state,resolve:context.resolveAction}
}
test('confirmation locks duplicate clicks and records the actual native outcome',async()=>{
 let finish,calls=0;const h=actionHarness({confirmAction:async id=>{assert.equal(id,7);calls++;return new Promise(r=>finish=r)},cancelAction:async()=>{}})
 const result=h.resolve(true);assert.equal(h.state.busy,true);assert.equal(await h.resolve(true),false);assert.equal(calls,1)
 finish('Se solicitó a Windows abrir Discord.');assert.equal(await result,true);assert.match(h.state.messages[0].content,/Se solicitó a Windows/);assert.equal(h.state.pending,null)
 assert.equal(await h.resolve(true),false);assert.equal(calls,1)
})
test('cancellation and failed native launch never record successful opening',async()=>{
 let opened=0,canceled=0
 const h=actionHarness({confirmAction:async()=>{opened++;throw Error('No disponible')},cancelAction:async()=>{canceled++}})
 assert.equal(await h.resolve(false),true);assert.equal(opened,0);assert.equal(canceled,1);assert.match(h.state.messages[0].content,/cancelada/)
 const failure=actionHarness({confirmAction:async()=>{throw Error('No disponible')},cancelAction:async()=>{}})
 assert.equal(await failure.resolve(true),false);assert.match(failure.state.error,/No disponible/);assert.match(failure.state.messages[0].content,/No se pudo/);assert.equal(failure.state.pending,null)
})

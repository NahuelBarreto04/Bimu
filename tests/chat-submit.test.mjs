import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
function harness(overrides={}){
 let finish,fail
 const state={messages:[],sending:false,error:''}
 const values={lock:{current:false},choosing:false,folder:null,toolsSupport:true,connected:true,model:'local',crypto:{randomUUID:()=> 'request'},active:{current:null},messages:[],mounted:{current:true},flushTimer:{current:null},archiveRef:{current:{memory:''}},setMessages:v=>state.messages=v,setSending:v=>state.sending=v,setStopping:()=>{},setError:v=>state.error=v,setNotice:()=>{},setActivity:()=>{},clearTimeout,setTimeout,client:{stream:()=>new Promise((resolve,reject)=>{finish=resolve;fail=reject})},...overrides}
 const source=readFileSync(new URL('../src/useOllama.js',import.meta.url),'utf8')
 const send=source.slice(source.indexOf('  const send=async'),source.indexOf('  return {actionProposal'))
 values.proposal={current:null};values.setActionProposal=p=>state.proposal=p
 const context=vm.createContext(values);vm.runInContext(send+';globalThis.send=send',context)
 return {state,send:context.send,finish:r=>finish(r),fail:e=>fail(e)}
}
test('clears accepted draft before stream finishes and preserves the next draft',async()=>{
 const h=harness();let draft='Hola Bimu'
 const pending=h.send(draft,()=>draft='')
 assert.equal(draft,'');assert.equal(h.state.sending,true);assert.equal(h.state.messages[0].content,'Hola Bimu')
 draft='Mi siguiente mensaje';h.finish({content:'Hola',stopped:false});assert.equal(await pending,true);assert.equal(draft,'Mi siguiente mensaje')
})
test('rejected prompts do not clear the draft',async()=>{
 for(const options of [{connected:false},{lock:{current:true}},{folder:{},toolsSupport:false}]){
  const h=harness(options);let accepted=false
  assert.equal(await h.send('Hola',()=>accepted=true),false);assert.equal(accepted,false)
 }
})
test('failed stream keeps the accepted user message visible with its error',async()=>{
 const h=harness();const pending=h.send('Mensaje importante',()=>{})
 h.fail(new Error('Sin conexión'));assert.equal(await pending,false)
 assert.equal(h.state.messages[0].content,'Mensaje importante');assert.equal(h.state.error,'Sin conexión');assert.equal(h.state.sending,false)
})

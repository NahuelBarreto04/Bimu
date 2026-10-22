import test from 'node:test'
import assert from 'node:assert/strict'
import {createOllamaClient} from '../src/ollama-client.js'
test('detecta modelos y envía el contexto al comando nativo',async()=>{
 const calls=[];const client=createOllamaClient(async(command,args)=>{calls.push({command,args});return command==='ollama_models'?['local-model:latest']:'Hola, soy Bimu.'})
 assert.deepEqual(await client.models(),['local-model:latest'])
 const messages=[{role:'user',content:'Hola'}]
 assert.equal(await client.chat('local-model:latest',messages),'Hola, soy Bimu.')
 assert.deepEqual(calls[1],{command:'ollama_chat',args:{model:'local-model:latest',messages}})
})
test('rechaza respuestas vacías o listas inválidas y conserva errores de conexión',async()=>{
 await assert.rejects(createOllamaClient(async()=>({})).models(),/Lista de modelos inválida/)
 await assert.rejects(createOllamaClient(async()=>['ok',1]).models(),/Lista de modelos inválida/)
 await assert.rejects(createOllamaClient(async()=>' ').chat('m',[]),/respuesta vacía/)
 await assert.rejects(createOllamaClient(async()=>{throw new Error('Sin conexión')}).models(),/Sin conexión/)
})
test('streaming entrega fragmentos y permite cancelar por identificador',async()=>{
 const calls=[];let channel
 const client=createOllamaClient(async(command,args)=>{
  calls.push({command,args})
  if(command==='ollama_cancel')return
  args.onEvent.onmessage({type:'delta',content:'¡Hola'})
  args.onEvent.onmessage({type:'unknown',content:'ignorar'})
  args.onEvent.onmessage({type:'delta',content:' Mariano!'})
  return {content:'¡Hola Mariano!',stopped:false}
 },()=>channel={})
 const chunks=[];assert.deepEqual(await client.stream('id-1','m',[{role:'user',content:'Hola'}],c=>chunks.push(c)),{content:'¡Hola Mariano!',stopped:false})
 assert.deepEqual(chunks,['¡Hola',' Mariano!'])
 await client.cancel('id-1');assert.deepEqual(calls[1],{command:'ollama_cancel',args:{requestId:'id-1'}})
})
test('acepta detener sin tokens y rechaza final vacío sin cancelación',async()=>{
 const client=createOllamaClient(async()=>({content:'',stopped:true}),()=>({}))
 assert.equal((await client.stream('id','m',[],()=>{})).stopped,true)
 await assert.rejects(createOllamaClient(async()=>({content:'',stopped:false}),()=>({})).stream('id','m',[],()=>{}),/vacía/)
})

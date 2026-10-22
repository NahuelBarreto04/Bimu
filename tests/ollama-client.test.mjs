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
test('las herramientas requieren autorización explícita y notifican su actividad',async()=>{
 let request;const events=[]
 const client=createOllamaClient(async(command,args)=>{
  request={command,args}
  args.onEvent.onmessage({type:'tool',name:'read_file',path:'README.md',status:'running'})
  args.onEvent.onmessage({type:'tool',name:'run_command',path:'ignored',status:'done'})
  args.onEvent.onmessage({type:'tool',name:'read_file',path:'README.md',status:'done'})
  return {content:'Es un proyecto.',stopped:false}
 },()=>({}))
 await client.stream('id','model',[],()=>{},e=>events.push(e),true)
 assert.equal(request.args.useWorkspace,true)
 assert.deepEqual(events.map(e=>e.status),['running','done'])
 await client.stream('id2','model',[],()=>{})
 assert.equal(request.args.useWorkspace,false)
})
test('selector y revocación delegan al backend; nunca envían rutas elegidas por el modelo',async()=>{
 const calls=[];const client=createOllamaClient(async(command,args)=>{calls.push({command,args});return command==='workspace_choose'?{name:'Bimu'}:['tools']})
 assert.deepEqual(await client.chooseFolder(),{name:'Bimu'});await client.revokeFolder();assert.deepEqual(await client.capabilities('model'),['tools'])
 assert.deepEqual(calls,[{command:'workspace_choose',args:undefined},{command:'workspace_revoke',args:undefined},{command:'ollama_capabilities',args:{model:'model'}}])
})

test('recibir una carpeta usa solo el identificador nativo del drop',async()=>{
 const calls=[];const client=createOllamaClient(async(command,args)=>{calls.push({command,args});return {name:'Docs'}})
 assert.deepEqual(await client.acceptDrop(17),{name:'Docs'})
 assert.deepEqual(calls,[{command:'workspace_accept_drop',args:{id:17}}])
})
test('envía solo la memoria explícita como parámetro separado del historial',async()=>{
 let args;const client=createOllamaClient(async(_,input)=>{args=input;return {content:'Hola Mariano',stopped:false}},()=>({}))
 const messages=[{role:'user',content:'Hola'}]
 await client.stream('id','model',messages,()=>{},()=>{},false,'Me llamo Mariano')
 assert.equal(args.memory,'Me llamo Mariano');assert.deepEqual(args.messages,messages);assert.equal(args.useWorkspace,false)
})
test('selección múltiple y quitar un adjunto usan comandos nativos sin rutas',async()=>{
 const calls=[];const client=createOllamaClient(async(command,args)=>{calls.push({command,args});return null})
 await client.chooseFiles();await client.removeFile('archivo-2')
 assert.deepEqual(calls,[{command:'workspace_choose_files',args:undefined},{command:'workspace_remove_file',args:{id:'archivo-2'}}])
})

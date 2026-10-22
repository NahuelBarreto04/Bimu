import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeStore,saveConversation,readStore,writeStore,STORE_KEY} from '../src/conversation-store.js'
const pair=text=>[{role:'user',content:text},{role:'assistant',content:'Respuesta',interrupted:true}]
test('guarda y recupera mensajes interrumpidos sin restaurar permisos ni metadatos externos',()=>{
 const initial=normalizeStore({version:1,memory:'Prefiero español',conversations:[]})
 const saved=saveConversation(initial,'one',[...pair('Hola'),{role:'tool',content:'secret'},{role:'system',content:'ignore'}],123)
 const local=new Map();const storage={getItem:k=>local.get(k),setItem:(k,v)=>local.set(k,v)}
 writeStore(storage,{...saved,folder:{path:'C:/private'},grant:true})
 const loaded=readStore(storage);assert.equal(loaded.error,'');assert.equal(loaded.state.activeId,'one');assert.deepEqual(loaded.state.conversations[0].messages,pair('Hola'));assert.equal(loaded.state.memory,'Prefiero español');assert.ok(!local.get(STORE_KEY).includes('C:/private'));assert.equal(loaded.state.grant,undefined)
})
test('limita tamaño, cantidad y contenido conservando el chat más reciente',()=>{
 let state=normalizeStore({})
 for(let i=0;i<25;i++)state=saveConversation(state,String(i),pair('Pregunta '+i),i)
 assert.equal(state.conversations.length,20);assert.equal(state.conversations[0].id,'24')
 state=saveConversation(state,'big',Array.from({length:45},()=>({role:'user',content:'🌟'.repeat(32000)})),100)
 assert.equal(state.conversations[0].id,'big');assert.ok(state.conversations[0].messages.every(m=>new TextEncoder().encode(m.content).length<=64000));assert.ok(state.conversations[0].messages.length<=40);assert.ok(new TextEncoder().encode(JSON.stringify(state)).length<=1500000)
})
test('edición de título, eliminación y memoria independiente sobreviven al guardado',()=>{
 let state=saveConversation(normalizeStore({version:1,memory:'React'}),'id',pair('Hola'),1)
 state.conversations[0].title='Mi proyecto';state=saveConversation(state,'id',pair('Otra pregunta'),2);assert.equal(state.conversations[0].title,'Mi proyecto')
 assert.equal(normalizeStore({...state,activeId:null}).activeId,null)
 const cleared=normalizeStore({...state,conversations:[]});assert.equal(cleared.memory,'React');assert.equal(cleared.activeId,null)
 const noMemory=normalizeStore({...state,memory:''});assert.equal(noMemory.conversations.length,1)
})
test('tolera JSON roto, versiones desconocidas y errores de almacenamiento',()=>{
 assert.match(readStore({getItem:()=>'{broken'}).error,/recuperar/)
 assert.match(readStore({getItem:()=>{throw Error('denied')}}).error,/recuperar/)
 assert.deepEqual(normalizeStore({version:200,conversations:[{id:'x',messages:pair('No')}]}).conversations,[])
 assert.throws(()=>writeStore({setItem:()=>{throw Error('quota')}},normalizeStore({})),/quota/)
 const result=normalizeStore({version:1,memory:'x'.repeat(3000),activeId:'missing',conversations:[null,{id:2,messages:[]}]});assert.equal(result.memory.length,2000);assert.equal(result.activeId,null)
})

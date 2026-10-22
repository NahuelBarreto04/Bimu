export const STORE_KEY='bimu-conversations-v1'
export const MAX_CHATS=20
const MAX_BYTES=1500000
function boundedText(text){
  if(text.length<=16000)return text
  const bytes=new TextEncoder().encode(text)
  return bytes.length<=64000?text:new TextDecoder().decode(bytes.subarray(0,64000),{stream:true})
}
export function normalizeStore(value){
  const source=value?.version===1?value:{}
  const seen=new Set()
  const conversations=(Array.isArray(source.conversations)?source.conversations:[]).filter(c=>c&&typeof c.id==='string'&&c.id.length<=100&&Array.isArray(c.messages)).map(c=>({
    id:c.id,title:typeof c.title==='string'?c.title.slice(0,80):'Conversación',updatedAt:Number.isFinite(c.updatedAt)?c.updatedAt:0,
    messages:c.messages.filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string'&&m.content.trim()).slice(-40).map(m=>({role:m.role,content:boundedText(m.content),...(m.interrupted?{interrupted:true}:{})}))
  })).filter(c=>c.messages.length&&!seen.has(c.id)&&seen.add(c.id)).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,MAX_CHATS)
  const state={version:1,activeId:typeof source.activeId==='string'?source.activeId:null,memory:typeof source.memory==='string'?source.memory.slice(0,2000):'',conversations}
  // Keep the most recent chats within a conservative WebView storage budget.
  const encoder=new TextEncoder(),bytesOf=value=>encoder.encode(JSON.stringify(value)).length
  let bytes=bytesOf(state)
  while(state.conversations.length>1&&bytes>MAX_BYTES)bytes-=bytesOf(state.conversations.pop())+1
  while(state.conversations[0]?.messages.length>1&&bytes>MAX_BYTES)bytes-=bytesOf(state.conversations[0].messages.shift())+1
  if(state.activeId&&!state.conversations.some(c=>c.id===state.activeId))state.activeId=null
  return state
}
export function readStore(storage){
  try{const raw=storage.getItem(STORE_KEY);return {state:normalizeStore(raw?JSON.parse(raw):{}),error:''}}
  catch{return {state:normalizeStore({}),error:'No se pudo recuperar el historial local. No se sobrescribirá hasta que guardes una conversación o cambies tu memoria.'}}
}
export function writeStore(storage,state){storage.setItem(STORE_KEY,JSON.stringify(normalizeStore(state)))}
export function saveConversation(state,id,messages,now=Date.now()){
  const existing=state.conversations.find(c=>c.id===id)
  const title=existing?.title||messages.find(m=>m.role==='user')?.content.replace(/\s+/g,' ').slice(0,60)||'Conversación'
  return normalizeStore({...state,activeId:id,conversations:[{id,title,updatedAt:now,messages},...state.conversations.filter(c=>c.id!==id)]})
}

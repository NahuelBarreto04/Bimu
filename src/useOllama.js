import {useEffect,useRef,useState} from 'react'
import {createOllamaClient} from './ollama-client'
import {readStore,writeStore,saveConversation} from './conversation-store'
const client=createOllamaClient()
export function useOllama(native){
  const [initial]=useState(()=>readStore(localStorage))
  const [archive,setArchive]=useState(initial.state),[storageError,setStorageError]=useState(initial.error)
  const [conversationId,setConversationId]=useState(()=>initial.state.activeId||crypto.randomUUID())
  const archiveRef=useRef(archive);archiveRef.current=archive
  const persist=next=>{archiveRef.current=next;setArchive(next);try{writeStore(localStorage,next);setStorageError('')}catch{setStorageError('No se pudo guardar en este equipo. El historial de esta sesión sigue disponible, pero los cambios pueden perderse al cerrar.')}}

  const [models,setModels]=useState([]),[model,setModel]=useState(()=>{try{return localStorage.getItem('bimu-model')||''}catch{return ''}})
  const [checking,setChecking]=useState(false),[connected,setConnected]=useState(false),[error,setError]=useState('')
  const [messages,setMessages]=useState(()=>initial.state.conversations.find(c=>c.id===initial.state.activeId)?.messages||[]),[sending,setSending]=useState(false),[stopping,setStopping]=useState(false),[notice,setNotice]=useState('')
  const [folder,setFolder]=useState(null),[choosing,setChoosing]=useState(false),[toolsSupport,setToolsSupport]=useState(null),[activity,setActivity]=useState([]),[capabilityRevision,setCapabilityRevision]=useState(0)
  const lock=useRef(false),scan=useRef(false),active=useRef(null),flushTimer=useRef(),mounted=useRef(true)
  const skipInitialSave=useRef(true)
  useEffect(()=>{
    if(skipInitialSave.current){skipInitialSave.current=false;return}
    if(!sending&&messages.length)persist(saveConversation(archiveRef.current,conversationId,messages))
  },[messages,sending,conversationId])
  const freshConversation=()=>{persist({...archiveRef.current,activeId:null});setConversationId(crypto.randomUUID());setMessages([]);setActivity([]);setError('');setNotice('')}
  const releaseFolder=async()=>{if(folder){await client.revokeFolder();setFolder(null)}}
  const newConversation=async()=>{if(lock.current||choosing)return;setChoosing(true);try{await releaseFolder();freshConversation()}catch(e){setError(String(e.message||e))}finally{setChoosing(false)}}
  const restoreConversation=async id=>{
    if(lock.current||choosing)return
    const saved=archiveRef.current.conversations.find(c=>c.id===id);if(!saved)return
    setChoosing(true)
    try{await releaseFolder();setConversationId(id);setMessages(saved.messages);setActivity([]);setError('');setNotice('Conversación recuperada. Si necesitás archivos, compartí la carpeta nuevamente.')}
    catch(e){setError(String(e.message||e))}finally{setChoosing(false)}
  }
  const renameConversation=(id,title)=>{if(lock.current||choosing||!title.trim())return;persist({...archiveRef.current,conversations:archiveRef.current.conversations.map(c=>c.id===id?{...c,title:title.trim().slice(0,80)}:c)})}
  const deleteConversation=async id=>{
    if(lock.current||choosing)return
    if(id===conversationId){setChoosing(true);try{await releaseFolder();freshConversation()}catch(e){setError(String(e.message||e));return}finally{setChoosing(false)}}
    persist({...archiveRef.current,activeId:id===conversationId?null:archiveRef.current.activeId,conversations:archiveRef.current.conversations.filter(c=>c.id!==id)})
  }
  const clearHistory=async()=>{
    if(lock.current||choosing)return
    setChoosing(true);try{await releaseFolder();freshConversation();persist({...archiveRef.current,activeId:null,conversations:[]})}catch(e){setError(String(e.message||e))}finally{setChoosing(false)}
  }
  const saveMemory=text=>{if(lock.current||choosing)return;persist({...archiveRef.current,memory:text.trim().slice(0,2000)})}
  const refresh=async()=>{
    if(scan.current)return
    if(!native){setError('Abrí la aplicación de escritorio para conectar Ollama.');return}
    scan.current=true;setChecking(true);setError('')
    try{const list=await client.models();if(!mounted.current)return;setModels(list);setConnected(true);setCapabilityRevision(n=>n+1);setModel(current=>list.includes(current)?current:list[0]||'')}
    catch(e){if(mounted.current){setConnected(false);setModels([]);setError(String(e.message||e))}}
    finally{scan.current=false;if(mounted.current)setChecking(false)}
  }
  useEffect(()=>{mounted.current=true;if(native)refresh();return()=>{mounted.current=false;clearTimeout(flushTimer.current);const id=active.current;active.current=null;if(id)client.cancel(id).catch(()=>{})}},[native])
  useEffect(()=>{try{localStorage.setItem('bimu-model',model)}catch{setStorageError('No se pudieron guardar las preferencias en este equipo.')}},[model])
  useEffect(()=>{
    if(!native||!connected||!model){setToolsSupport(null);return}
    let disposed=false;setToolsSupport(null)
    client.capabilities(model).then(c=>{if(!disposed)setToolsSupport(Array.isArray(c)&&c.includes('tools'))}).catch(()=>{if(!disposed)setToolsSupport(false)})
    return()=>{disposed=true}
  },[native,connected,model,capabilityRevision])
  const chooseFolder=async()=>{
    if(lock.current||choosing)return
    if(!native){setError('Abrí Bimu en el escritorio para elegir una carpeta.');return}
    setChoosing(true);setError('')
    try{const selected=await client.chooseFolder();if(selected){setFolder(selected);freshConversation();setNotice('Carpeta compartida en modo solo lectura para esta sesión.')}}catch(e){setError(String(e.message||e))}finally{setChoosing(false)}
  }
  const chooseFiles=async()=>{
    if(lock.current||choosing)return
    if(!native){setError('Abrí Bimu en el escritorio para compartir archivos.');return}
    setChoosing(true);setError('')
    try{const selected=await client.chooseFiles();if(selected){setFolder(selected);if(folder?.kind!=='files')freshConversation();setNotice('Archivos preparados en modo solo lectura. Podés pedir un resumen o compararlos.')}}catch(e){setError(String(e.message||e))}finally{setChoosing(false)}
  }
  const removeFile=async id=>{if(lock.current||choosing)return;setChoosing(true);try{const selected=await client.removeFile(id);setFolder(selected);freshConversation();setNotice('Archivo quitado. Se inició un chat nuevo.')}catch(e){setError(String(e.message||e))}finally{setChoosing(false)}}
  const recordAction=(text,result)=>{if(lock.current)return;setMessages(items=>[...items.slice(-38),{role:'user',content:text},{role:'assistant',content:result}]);setNotice('');setError('')}
  const acceptDroppedFolder=async id=>{
    if(lock.current||choosing)return false
    setChoosing(true);setError('')
    try{const selected=await client.acceptDrop(id);setFolder(selected);if(selected.kind!=='files'||folder?.kind!=='files')freshConversation();setNotice('Contenido recibido. ¿Qué querés saber sobre él?');return true}
    catch(e){setError(String(e.message||e));return false}finally{setChoosing(false)}
  }
  const revokeFolder=async()=>{
    if(lock.current||choosing)return
    try{await client.revokeFolder();setFolder(null);freshConversation();setError('');setNotice('Acceso quitado. Se limpió el chat de esta sesión.')}catch(e){setError(String(e.message||e))}
  }
  const stop=async()=>{
    const id=active.current;if(!id||stopping)return
    setStopping(true)
    try{await client.cancel(id)}catch(e){if(mounted.current){setStopping(false);setError('No se pudo detener: '+String(e.message||e))}}
  }
  const send=async(text,onAccepted)=>{
    const content=text.trim()
    if(lock.current||choosing||!content)return false
    if(folder&&folder.kind!=='files'&&toolsSupport!==true){setError(toolsSupport===null?'Esperá mientras se comprueba el soporte de herramientas.':'Este modelo no admite herramientas o no se pudo comprobar. Elegí otro o quitá la carpeta para conversar.');return false}
    if(!connected||!model){setError('Conectá Ollama y elegí un modelo antes de enviar.');return false}
    lock.current=true;setSending(true);setStopping(false);setError('');setNotice('');setActivity([])
    const id=crypto.randomUUID();active.current=id
    const previous=messages.filter(m=>m.content.trim()).slice(-38)
    const context=[...previous,{role:'user',content}]
    let partial=''
    setMessages(context)
    onAccepted?.()
    const snapshot=interrupted=>[...context,{role:'assistant',content:partial,interrupted}]
    try{
      const result=await client.stream(id,model,context.map(({role,content})=>({role,content})),delta=>{
        if(active.current!==id||!mounted.current)return
        partial+=delta
        if(!flushTimer.current)flushTimer.current=setTimeout(()=>{flushTimer.current=null;if(active.current===id&&mounted.current)setMessages(snapshot(false))},32)
      },event=>{
        if(active.current!==id||!mounted.current)return
        setActivity(items=>{const key=event.name+':'+event.path;const index=items.findLastIndex(item=>item.key===key&&item.status==='running');if(event.status!=='running'&&index>=0)return items.map((item,i)=>i===index?{...event,key}:item);return [...items,{...event,key}].slice(-16)})
      },Boolean(folder),archiveRef.current.memory)
      if(!mounted.current)return false
      clearTimeout(flushTimer.current);flushTimer.current=null;active.current=null
      partial=result.content
      setMessages(partial.trim()?snapshot(result.stopped):context)
      if(result.stopped)setNotice('Generación detenida. Podés seguir conversando.');if(result.stopped)setActivity(items=>items.map(item=>item.status==='running'?{...item,status:'stopped'}:item))
      return true
    }catch(e){
      if(mounted.current){clearTimeout(flushTimer.current);flushTimer.current=null;setMessages(partial.trim()?snapshot(true):context);setError(String(e.message||e));setActivity(items=>items.map(item=>item.status==='running'?{...item,status:'error'}:item))}
      return false
    }finally{active.current=null;lock.current=false;if(mounted.current){setSending(false);setStopping(false)}}
  }
  return {chooseFiles,removeFile,recordAction,history:archive.conversations,conversationId,memory:archive.memory,storageError,newConversation,restoreConversation,renameConversation,deleteConversation,clearHistory,saveMemory,acceptDroppedFolder,folder,choosing,toolsSupport,activity,chooseFolder,revokeFolder,models,model,setModel,checking,connected,error,messages,sending,stopping,notice,refresh,send,stop,clear:newConversation}
}

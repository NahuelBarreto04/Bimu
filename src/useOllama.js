import {useEffect,useRef,useState} from 'react'
import {createOllamaClient} from './ollama-client'
const client=createOllamaClient()
export function useOllama(native){
  const [models,setModels]=useState([]),[model,setModel]=useState(()=>localStorage.getItem('bimu-model')||'')
  const [checking,setChecking]=useState(false),[connected,setConnected]=useState(false),[error,setError]=useState('')
  const [messages,setMessages]=useState([]),[sending,setSending]=useState(false),[stopping,setStopping]=useState(false),[notice,setNotice]=useState('')
  const lock=useRef(false),scan=useRef(false),active=useRef(null),flushTimer=useRef(),mounted=useRef(true)
  const refresh=async()=>{
    if(scan.current)return
    if(!native){setError('Abrí la aplicación de escritorio para conectar Ollama.');return}
    scan.current=true;setChecking(true);setError('')
    try{const list=await client.models();if(!mounted.current)return;setModels(list);setConnected(true);setModel(current=>list.includes(current)?current:list[0]||'')}
    catch(e){if(mounted.current){setConnected(false);setModels([]);setError(String(e.message||e))}}
    finally{scan.current=false;if(mounted.current)setChecking(false)}
  }
  useEffect(()=>{mounted.current=true;if(native)refresh();return()=>{mounted.current=false;clearTimeout(flushTimer.current);const id=active.current;active.current=null;if(id)client.cancel(id).catch(()=>{})}},[native])
  useEffect(()=>{localStorage.setItem('bimu-model',model)},[model])
  const stop=async()=>{
    const id=active.current;if(!id||stopping)return
    setStopping(true)
    try{await client.cancel(id)}catch(e){if(mounted.current){setStopping(false);setError('No se pudo detener: '+String(e.message||e))}}
  }
  const send=async(text)=>{
    const content=text.trim()
    if(lock.current||!content)return false
    if(!connected||!model){setError('Conectá Ollama y elegí un modelo antes de enviar.');return false}
    lock.current=true;setSending(true);setStopping(false);setError('');setNotice('')
    const id=crypto.randomUUID();active.current=id
    const previous=messages.filter(m=>m.content.trim()).slice(-38)
    const context=[...previous.map(({role,content})=>({role,content})),{role:'user',content}]
    let partial=''
    setMessages(context)
    const snapshot=interrupted=>[...context,{role:'assistant',content:partial,interrupted}]
    try{
      const result=await client.stream(id,model,context,delta=>{
        if(active.current!==id||!mounted.current)return
        partial+=delta
        if(!flushTimer.current)flushTimer.current=setTimeout(()=>{flushTimer.current=null;if(active.current===id&&mounted.current)setMessages(snapshot(false))},32)
      })
      if(!mounted.current)return false
      clearTimeout(flushTimer.current);flushTimer.current=null;active.current=null
      partial=result.content
      setMessages(partial.trim()?snapshot(result.stopped):context)
      if(result.stopped)setNotice('Generación detenida. Podés seguir conversando.')
      return true
    }catch(e){
      if(mounted.current){clearTimeout(flushTimer.current);flushTimer.current=null;setMessages(partial.trim()?snapshot(true):previous);setError(String(e.message||e))}
      return false
    }finally{active.current=null;lock.current=false;if(mounted.current){setSending(false);setStopping(false)}}
  }
  return {models,model,setModel,checking,connected,error,messages,sending,stopping,notice,refresh,send,stop,clear:()=>{if(!lock.current){setMessages([]);setError('');setNotice('')}}}
}

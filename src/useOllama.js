import {useEffect,useRef,useState} from 'react'
import {createOllamaClient} from './ollama-client'
const client=createOllamaClient()
export function useOllama(native){
  const [models,setModels]=useState([]),[model,setModel]=useState(()=>localStorage.getItem('bimu-model')||'')
  const [checking,setChecking]=useState(false),[connected,setConnected]=useState(false),[error,setError]=useState('')
  const [messages,setMessages]=useState([]),[sending,setSending]=useState(false)
  const lock=useRef(false),scan=useRef(false)
  const refresh=async()=>{
    if(scan.current)return
    if(!native){setError('Abrí la aplicación de escritorio para conectar Ollama.');return}
    scan.current=true;setChecking(true);setError('')
    try{const list=await client.models();setModels(list);setConnected(true);setModel(current=>list.includes(current)?current:list[0]||'')}
    catch(e){setConnected(false);setModels([]);setError(String(e.message||e))}
    finally{scan.current=false;setChecking(false)}
  }
  useEffect(()=>{if(native)refresh()},[native])
  useEffect(()=>{localStorage.setItem('bimu-model',model)},[model])
  const send=async(text)=>{
    const content=text.trim()
    if(lock.current||!content)return false
    if(!connected||!model){setError('Conectá Ollama y elegí un modelo antes de enviar.');return false}
    lock.current=true;setSending(true);setError('')
    const previous=messages.slice(-38);const context=[...previous,{role:'user',content}]
    setMessages(context)
    try{const reply=await client.chat(model,context);setMessages([...context,{role:'assistant',content:reply}]);return true}
    catch(e){setMessages(previous);setError(String(e.message||e));return false}
    finally{lock.current=false;setSending(false)}
  }
  return {models,model,setModel,checking,connected,error,messages,sending,refresh,send,clear:()=>{if(!lock.current){setMessages([]);setError('')}}}
}

import {useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
export function useStartup({native,listenPreferred,onGreeting}){
 const [status,setStatus]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const mounted=useRef(true),epoch=useRef(0),greeted=useRef(false),greeting=useRef(onGreeting);greeting.current=onGreeting
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++}},[])
 useEffect(()=>{
  if(!native)return
  const ticket=++epoch.current;setBusy(true)
  invoke('startup_sync',{listenPreferred}).then(value=>{if(mounted.current&&epoch.current===ticket){setStatus(value);setError('')}}).catch(e=>{if(mounted.current&&epoch.current===ticket)setError(String(e.message||e))}).finally(()=>{if(mounted.current&&epoch.current===ticket)setBusy(false)})
 },[native,listenPreferred])
 useEffect(()=>{
  if(!status?.automaticLaunch||greeted.current)return
  let timer
  const greet=()=>{if(document.hidden||greeted.current)return;clearTimeout(timer);timer=setTimeout(()=>{if(mounted.current&&!document.hidden&&!greeted.current){greeted.current=true;greeting.current?.()}},600)}
  greet();document.addEventListener('visibilitychange',greet);document.addEventListener('bimu-surface-ready',greet)
  return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',greet);document.removeEventListener('bimu-surface-ready',greet)}
 },[status?.automaticLaunch])
 const setEnabled=async enabled=>{if(busy)return;const ticket=++epoch.current;setBusy(true);setError('');try{const value=await invoke('startup_set',{enabled});if(mounted.current&&epoch.current===ticket)setStatus(value)}catch(e){if(mounted.current&&epoch.current===ticket)setError(String(e.message||e))}finally{if(mounted.current&&epoch.current===ticket)setBusy(false)}}
 return {status,busy,error,setEnabled}
}

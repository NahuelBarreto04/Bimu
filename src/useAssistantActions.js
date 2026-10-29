import {useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {folderRequest,shortcutMatch,shortcutSummary} from './assistant-intent'
export function useAssistantActions({native,onResult,onFeedback,onShow,onActivity}){
 const [items,setItems]=useState([]),[busy,setBusy]=useState(false),[pending,setPending]=useState(null),[error,setError]=useState(''),[search,setSearch]=useState(null),[execution,setExecution]=useState(null),[searching,setSearching]=useState(false)
 const mounted=useRef(true),lock=useRef(false),current=useRef(null),generation=useRef(0),latest=useRef();latest.current={onResult,onFeedback,onShow,onActivity}
 const refresh=async()=>{if(!native)return;try{const list=await invoke('shortcuts_list');if(mounted.current)setItems(list)}catch(e){if(mounted.current)setError(String(e.message||e))}}
 useEffect(()=>{mounted.current=true;refresh();return()=>{mounted.current=false;generation.current++;if(!native)return;invoke('folders_cancel').catch(()=>{});invoke('shortcuts_cancel').catch(()=>{})}},[native])
 const show=()=>{latest.current.onShow?.();latest.current.onActivity?.()}
 const fail=e=>{if(mounted.current){const message=String(e.message||e);setError(message);latest.current.onFeedback?.('error',message);show()}}
 const finish=(result,proposal)=>{if(!mounted.current)return;setExecution(result);const summary=shortcutSummary(result);if(!proposal?.silent)latest.current.onResult?.(proposal?.text||result.name,summary);latest.current.onFeedback?.(result.results.every(s=>s.ok)?'success':'warning',summary);if(result.results.some(s=>!s.ok))show()}
 const request=async(text,options={})=>{
  const folder=folderRequest(text),shortcut=shortcutMatch(items,text);if(!folder&&!shortcut)return false
  if(!native){fail(Error('Abrí Bimu en el escritorio para usar los atajos y buscar carpetas.'));return 'error'}
  if(lock.current||current.current)return 'error'
  lock.current=true;setBusy(true);setError('');latest.current.onActivity?.()
  const ticket=++generation.current
  try{
   if(folder){setSearch(null);setSearching(true);latest.current.onFeedback?.('idle','Buscando la carpeta en tus discos locales…');show();const result=await invoke('folders_search',{text,within:options.within||null});if(!mounted.current||ticket!==generation.current)return true;if(!result.cancelled){setSearch({...result,text});if(result.opened){const message='Se solicitó abrir '+result.opened+'.';if(!options.silent)latest.current.onResult?.(text,message);latest.current.onFeedback?.('success','Abriendo '+folder.name+'…')}else latest.current.onFeedback?.('idle',result.matches.length?'Encontré carpetas. Elegí cuál abrir.':'No encontré coincidencias en esta búsqueda.')}}
   else{const result=await invoke('shortcuts_request',{text});if(!mounted.current){await invoke('shortcuts_cancel');return true}if(!result)return false;if(result.status==='confirm'){const proposal={...result,kind:'shortcut',text,silent:!!options.silent};current.current=proposal;setPending(proposal);options.onFeedback?.('confirm','¿Ejecuto '+result.name+'?')}else finish(result,{text,silent:!!options.silent})}
   return true
  }catch(e){if(ticket===generation.current)fail(e);return 'error'}finally{if(mounted.current&&ticket===generation.current){lock.current=false;setBusy(false);setSearching(false)}}
 }
 const confirm=async remember=>{if(lock.current||!current.current)return false;const proposal=current.current;lock.current=true;setBusy(true);setError('');try{const result=await invoke('shortcuts_confirm',{id:proposal.id,remember});finish(result,proposal);await refresh();return result.results.every(s=>s.ok)}catch(e){fail(e);return false}finally{current.current=null;lock.current=false;if(mounted.current){setPending(null);setBusy(false)}}}
 const cancel=async()=>{if(lock.current)return;try{await invoke('shortcuts_cancel');current.current=null;setPending(null)}catch(e){fail(e)}}
 const cancelSearch=async()=>{generation.current++;lock.current=false;setBusy(false);setSearching(false);setSearch(null);try{await invoke('folders_cancel')}catch(e){fail(e)}}
 const change=async(command,args)=>{if(lock.current||current.current)return false;lock.current=true;setBusy(true);setError('');try{const result=await invoke(command,args);if(mounted.current)setItems(result);return true}catch(e){fail(e);return false}finally{lock.current=false;if(mounted.current)setBusy(false)}}
 const pickFolder=async()=>{try{return await invoke('assistant_pick_folder')}catch(e){fail(e);return null}}
 const openFolder=async id=>{if(lock.current)return;lock.current=true;setBusy(true);try{const path=await invoke('folders_open',{id});latest.current.onFeedback?.('success','Abriendo la carpeta…');setSearch(s=>s?{...s,opened:path}:s);latest.current.onActivity?.()}catch(e){fail(e)}finally{lock.current=false;if(mounted.current)setBusy(false)}}
 const runButton=async id=>{if(!native||lock.current||current.current)return null;lock.current=true;setBusy(true);setError('');latest.current.onActivity?.();try{return await invoke('shortcuts_run_button',{id})}catch(e){if(mounted.current)setError(String(e.message||e));return null}finally{lock.current=false;if(mounted.current)setBusy(false)}}
 return {items,busy,pending,error,search,execution,searching,request,confirm,cancel,refresh,pickFolder,openFolder,cancelSearch,runButton,isCommand:text=>!!folderRequest(text)||!!shortcutMatch(items,text),save:shortcut=>change('shortcuts_save',{shortcut}),reorder:ids=>change('shortcuts_reorder',{ids}),remove:id=>change('shortcuts_remove',{id}),clear:()=>{setSearch(null);setExecution(null);setError('')}}
}

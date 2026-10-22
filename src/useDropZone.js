import {useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {listen} from '@tauri-apps/api/event'
import {getCurrentWindow,cursorPosition} from '@tauri-apps/api/window'
import {clamp} from './dock-geometry'
const EMPTY={stage:'idle',preview:null,error:''}
export function useDropZone({native,busy,reception}){
  const [state,setState]=useState(EMPTY),[accepting,setAccepting]=useState(false)
  const current=useRef(EMPTY),sequence=useRef(0),ticket=useRef(null),leaveTimer=useRef(),lastMove=useRef(0),moving=useRef(false),busyRef=useRef(busy)
  busyRef.current=busy
  const update=next=>{current.current=next;setState(next)}
  const discard=id=>{if(native&&id!=null)invoke('workspace_discard_drop',{id}).catch(()=>{})}
  const reset=()=>{sequence.current++;clearTimeout(leaveTimer.current);discard(ticket.current);ticket.current=null;update(EMPTY);reception.current.target=[0,0]}
  const position=async(force=false)=>{
    if(!native||moving.current||(!force&&performance.now()-lastMove.current<32))return
    moving.current=true;lastMove.current=performance.now()
    try{
      const win=getCurrentWindow();const [point,origin,scale]=await Promise.all([cursorPosition(),win.innerPosition(),win.scaleFactor()])
      if(current.current.stage!=='hover')return
      const rect=document.querySelector('.desktop')?.getBoundingClientRect();if(!rect)return
      const nx=clamp(((point.x-origin.x)/scale-rect.left)/Math.max(1,rect.width)*2-1,-1,1)
      const ny=clamp(((point.y-origin.y)/scale-rect.top)/Math.max(1,rect.height)*2-1,-1,1)
      reception.current.target=[nx,ny]
      document.documentElement.style.setProperty('--drop-x',nx*Math.max(0,Math.min(95,rect.width/2-48))+'px')
      document.documentElement.style.setProperty('--drop-y',ny*Math.max(0,Math.min(65,rect.height/2-38))+'px')
    }catch{/* A missed position sample must not abort a real drag. */}finally{moving.current=false}
  }
  useEffect(()=>{
    const root=document.documentElement
    let returnTimer
    if(state.stage==='idle'&&root.dataset.receive&&root.dataset.receive!=='idle'){root.dataset.dropReturn='true';returnTimer=setTimeout(()=>delete root.dataset.dropReturn,280)}
    else delete root.dataset.dropReturn
    root.dataset.receive=state.stage
    reception.current.active=state.stage==='hover'||state.stage==='preparing'
    reception.current.catching=state.stage==='preparing'
    if(state.stage!=='hover'){
      reception.current.target=[0,0];root.style.setProperty('--drop-x','0px');root.style.setProperty('--drop-y','0px')
    }
    return()=>clearTimeout(returnTimer)
  },[state.stage,reception])
  useEffect(()=>{
    if(!native)return
    let disposed=false,off
    const handle=async({payload})=>{
      if(disposed)return
      const {kind,id}=payload||{}
      if(kind==='enter'||kind==='over'){
        clearTimeout(leaveTimer.current)
        if(['preparing','ready'].includes(current.current.stage))return
        if(busyRef.current){if(current.current.stage!=='error')update({stage:'error',preview:null,error:'Terminá o cancelá la operación actual antes de compartir contenido.'});return}
        if(current.current.stage!=='hover')update({stage:'hover',preview:null,error:''})
        position(kind==='enter');return
      }
      if(kind==='leave'){
        if(current.current.stage==='hover')leaveTimer.current=setTimeout(()=>{if(current.current.stage==='hover')reset()},180)
        return
      }
      if(kind!=='drop'||!Number.isSafeInteger(id))return
      clearTimeout(leaveTimer.current);const op=++sequence.current
      discard(ticket.current);ticket.current=id
      if(busyRef.current){update({stage:'error',preview:null,error:'Terminá o cancelá la operación actual antes de compartir contenido.'});return}
      update({stage:'preparing',preview:null,error:''})
      try{
        const wait=matchMedia('(prefers-reduced-motion: reduce)').matches?0:280
        const [preview]=await Promise.all([invoke('workspace_stage_drop',{id}),new Promise(resolve=>setTimeout(resolve,wait))])
        if(disposed||sequence.current!==op)return
        update({stage:'ready',preview,error:''})
      }catch(error){if(!disposed&&sequence.current===op)update({stage:'error',preview:null,error:String(error.message||error)})}
    }
    listen('bimu-folder-drag',handle).then(fn=>{if(disposed)fn();else off=fn}).catch(error=>{if(!disposed)update({stage:'error',preview:null,error:String(error)})})
    return()=>{disposed=true;sequence.current++;off?.();clearTimeout(leaveTimer.current);discard(ticket.current);ticket.current=null;reception.current.active=false;reception.current.catching=false}
  },[native,reception])
  const accept=async(commit)=>{
    if(current.current.stage!=='ready'||busyRef.current||accepting)return false
    setAccepting(true)
    try{
      const ok=await commit(current.current.preview.id)
      if(ok){ticket.current=null;sequence.current++;update(EMPTY);return true}
      update({stage:'error',preview:null,error:'No se pudo compartir el contenido. Volvé a arrastrarlo para intentarlo de nuevo.'})
      return false
    }finally{setAccepting(false)}
  }
  return {...state,active:state.stage!=='idle',accepting,reset,accept}
}

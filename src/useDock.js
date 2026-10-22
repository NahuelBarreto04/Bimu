import {useEffect,useRef,useState} from 'react'
import {getCurrentWindow,LogicalSize,PhysicalPosition,currentMonitor,primaryMonitor,cursorPosition} from '@tauri-apps/api/window'
import {EDGES,isLateral,notchSize,dockPosition,slideOffset} from './dock-geometry'
const initial=()=>{try{const d=JSON.parse(localStorage.getItem('companion-dock')||'{}');return {edge:EDGES.includes(d.edge)?d.edge:'top',offsets:Object.fromEntries(EDGES.map(e=>[e,Number.isFinite(d.offsets?.[e])?Math.max(0,Math.min(1,d.offsets[e])):.5]))}}catch{return {edge:'top',offsets:{top:.5,bottom:.5,left:.5,right:.5}}}}
export function useDock({native,expanded,hovered,tab,size,onError}){
  const [dock,setDock]=useState(initial)
  const [dragging,setDragging]=useState(false)
  const [refresh,setRefresh]=useState(0)
  const shown=useRef(false)
  const monitorRef=useRef(null),queue=useRef(Promise.resolve()),revision=useRef(0),dragRef=useRef(null),suppressClick=useRef(false),moveRevision=useRef(0)
  const edge=dock.edge, lateral=isLateral(edge),state=expanded?'open':hovered||dragging?'peek':'idle'
  const fraction=dock.offsets[edge]
  useEffect(()=>{localStorage.setItem('companion-dock',JSON.stringify(dock))},[dock])
  useEffect(()=>{
    const root=document.documentElement
    root.dataset.edge=edge;root.dataset.notch=state;root.dataset.dragging=String(dragging);root.dataset.centered=String(Math.abs(fraction-.5)<.0001)
    const [wantedW,wantedH]=notchSize(edge,state,size,tab)
    root.style.setProperty('--notch-width',wantedW+'px');root.style.setProperty('--notch-height',wantedH+'px')
    if(!native)return
    const ticket=++revision.current
    queue.current=queue.current.catch(()=>{}).then(async()=>{
      if(ticket!==revision.current)return
      const win=getCurrentWindow(),monitor=await currentMonitor()||await primaryMonitor()
      if(!monitor)throw new Error('No se pudo detectar el monitor.')
      if(ticket!==revision.current)return
      monitorRef.current=monitor
      const scale=monitor.scaleFactor,area=monitor.workArea
      const width=Math.max(1,Math.min(wantedW,area.size.width/scale)),height=Math.max(1,Math.min(wantedH,area.size.height/scale))
      await win.setSize(new LogicalSize(width,height))
      const pos=dockPosition({x:area.position.x,y:area.position.y,width:area.size.width,height:area.size.height},Math.round(width*scale),Math.round(height*scale),edge,fraction)
      await win.setPosition(new PhysicalPosition(pos.x,pos.y))
      if(!shown.current){await win.show();shown.current=true}
    }).catch(e=>onError('No se pudo anclar el notch: '+String(e)))
  },[native,edge,state,size,tab,fraction,refresh,dragging])
  useEffect(()=>{
    if(!native)return
    let gone=false,off
    getCurrentWindow().onScaleChanged(()=>setRefresh(n=>n+1)).then(fn=>{if(gone)fn();else off=fn}).catch(e=>onError(String(e)))
    return()=>{gone=true;off?.()}
  },[native])
  const center=()=>setDock(d=>({...d,offsets:{...d.offsets,[d.edge]:.5}}))
  const reanchor=()=>setRefresh(n=>n+1)
  const handlers={
    onPointerDown:async e=>{
      if(e.button!==0)return
      e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId)
      const d={pointer:e.pointerId,start:fraction,x:e.screenX,y:e.screenY,moved:false,ready:!native};dragRef.current=d;suppressClick.current=false
      try{if(native){const point=await cursorPosition();if(dragRef.current!==d)return;d.x=point.x;d.y=point.y;d.ready=true}}catch(err){dragRef.current=null;onError(String(err))}
    },
    onPointerMove:async e=>{
      const d=dragRef.current;if(!d?.ready||e.pointerId!==d.pointer)return
      const ticket=++moveRevision.current
      try{
        const point=native?await cursorPosition():{x:e.screenX,y:e.screenY}
        if(dragRef.current!==d||ticket!==moveRevision.current)return
        const monitor=monitorRef.current,scale=native?monitor?.scaleFactor||1:1
        const delta=lateral?point.y-d.y:point.x-d.x
        if(Math.abs(delta)<4*scale&&!d.moved)return
        d.moved=true;suppressClick.current=true;setDragging(true)
        const span=native?(lateral?monitor?.workArea.size.height:monitor?.workArea.size.width):(lateral?window.innerHeight:window.innerWidth)
        const next=slideOffset(d.start,delta,span||1000,scale)
        setDock(current=>({...current,offsets:{...current.offsets,[edge]:next}}))
      }catch(err){onError(String(err))}
    },
    onPointerUp:e=>{dragRef.current=null;moveRevision.current++;setDragging(false);e.currentTarget.releasePointerCapture?.(e.pointerId)},
    onPointerCancel:()=>{dragRef.current=null;moveRevision.current++;setDragging(false)},
    onLostPointerCapture:()=>{dragRef.current=null;moveRevision.current++;setDragging(false)}
  }
  return {edge,lateral,state,dragging,center,reanchor,setEdge:edge=>{if(EDGES.includes(edge))setDock(d=>({...d,edge}))},centered:Math.abs(fraction-.5)<.0001,handlers,consumeDrag:()=>{const moved=suppressClick.current;suppressClick.current=false;return moved}}
}

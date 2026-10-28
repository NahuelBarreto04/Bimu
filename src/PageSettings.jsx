import React,{useRef,useState} from 'react'
import {GripVertical,ChevronUp,ChevronDown} from 'lucide-react'
import {PAGE_DEFINITIONS,movePage,togglePage} from './page-preferences'

export function PageSettings({pages,setPages}){
 const drag=useRef(null),list=useRef(null)
 const [dragging,setDragging]=useState(null),[target,setTarget]=useState(null)
 const move=(id,offset)=>setPages(current=>{const index=current.findIndex(p=>p.id===id),other=current[index+offset];return other?movePage(current,id,other.id):current})
 const endDrag=(event,cancel=false)=>{
  const active=drag.current
  if(!active||active.pointerId!==event.pointerId)return
  if(!cancel&&active.target&&active.target!==active.id)setPages(current=>movePage(current,active.id,active.target))
  drag.current=null;setDragging(null);setTarget(null)
 }
 const moveDrag=event=>{
  const active=drag.current
  if(!active||active.pointerId!==event.pointerId)return
  if(!active.started&&Math.abs(event.clientY-active.startY)<4)return
  active.started=true;setDragging(active.id)
  const rows=[...(list.current?.querySelectorAll('[data-page-id]')||[])]
  const row=rows.find(element=>{const rect=element.getBoundingClientRect();return event.clientY>=rect.top&&event.clientY<=rect.bottom})
  const next=row?.dataset.pageId||null
  active.target=next;setTarget(next)
 }
 return <section className="behavior-card glass-card page-settings"><h2>Personalizá tus páginas</h2><p>Activá las vistas que usás y arrastralas para elegir su orden.</p><ol className="page-settings-list" ref={list}>{pages.map((page,index)=>{
  const label=PAGE_DEFINITIONS.find(([id])=>id===page.id)?.[1],last=page.enabled&&pages.filter(p=>p.enabled).length===1
  return <li key={page.id} data-page-id={page.id} className={(dragging===page.id?'is-dragging ':'')+(dragging&&target===page.id&&dragging!==page.id?'is-drop-target':'')}><span className="page-drag" onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:page.id,pointerId:event.pointerId,startY:event.clientY,target:null,started:false}}} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={event=>endDrag(event,true)} onLostPointerCapture={event=>endDrag(event,true)} title={'Arrastrar '+label}><GripVertical size={16}/></span><span className="page-name">{label}</span><button type="button" aria-label={'Subir '+label} onClick={()=>move(page.id,-1)} disabled={index===0}><ChevronUp size={14}/></button><button type="button" aria-label={'Bajar '+label} onClick={()=>move(page.id,1)} disabled={index===pages.length-1}><ChevronDown size={14}/></button><input type="checkbox" checked={page.enabled} disabled={last} aria-label={'Mostrar '+label} onChange={()=>setPages(current=>togglePage(current,page.id))}/></li>
 })}</ol><small>Al menos una página debe permanecer activa.</small></section>
}

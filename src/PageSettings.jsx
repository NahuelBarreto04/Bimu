import React,{useRef,useState} from 'react'
import {GripVertical,ChevronUp,ChevronDown} from 'lucide-react'
import {PAGE_DEFINITIONS,movePage,togglePage} from './page-preferences'

export function PageSettings({pages,setPages}){
 const drag=useRef(null),list=useRef(null)
 const [motion,setMotion]=useState(null)
 const move=(id,offset)=>setPages(current=>{const index=current.findIndex(p=>p.id===id),other=current[index+offset];return other?movePage(current,id,other.id):current})
 const endDrag=(event,cancel=false)=>{
  const active=drag.current
  if(!active||active.pointerId!==event.pointerId)return
  if(!cancel&&active.started&&active.target&&active.target!==active.id)setPages(current=>movePage(current,active.id,active.target))
  drag.current=null;setMotion(null)
 }
 const moveDrag=event=>{
  const active=drag.current
  if(!active||active.pointerId!==event.pointerId)return
  const delta=event.clientY-active.startY
  if(!active.started&&Math.abs(delta)<4)return
  active.started=true
  let index=active.rows.findIndex(row=>event.clientY<row.mid)
  if(index<0)index=active.rows.length-1
  active.target=active.rows[index]?.id||active.id
  setMotion({id:active.id,delta,target:active.target,origin:active.origin,step:active.step})
 }
 return <section className="behavior-card glass-card page-settings"><h2>Personalizá tus páginas</h2><p>Activá las vistas que usás y arrastralas para elegir su orden.</p><ol className="page-settings-list" ref={list}>{pages.map((page,index)=>{
  const label=PAGE_DEFINITIONS.find(([id])=>id===page.id)?.[1],last=page.enabled&&pages.filter(p=>p.enabled).length===1
  const targetIndex=motion?pages.findIndex(p=>p.id===motion.target):-1
  const offset=!motion?0:page.id===motion.id?motion.delta:motion.origin<targetIndex&&index>motion.origin&&index<=targetIndex?-motion.step:motion.origin>targetIndex&&index>=targetIndex&&index<motion.origin?motion.step:0
  return <li key={page.id} data-page-id={page.id} className={motion?.id===page.id?'is-dragging':''} style={{transform:`translateY(${offset}px)`}}><span className="page-drag" onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);const rows=[...(list.current?.querySelectorAll('[data-page-id]')||[])].map(element=>{const rect=element.getBoundingClientRect();return{id:element.dataset.pageId,mid:rect.top+rect.height/2,top:rect.top,height:rect.height}});const origin=rows.findIndex(row=>row.id===page.id);const step=rows.length>1?Math.abs(rows[1].top-rows[0].top):(rows[origin]?.height||0);drag.current={id:page.id,pointerId:event.pointerId,startY:event.clientY,target:page.id,started:false,rows,origin,step}}} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={event=>endDrag(event,true)} onLostPointerCapture={event=>endDrag(event,true)} title={'Arrastrar '+label}><GripVertical size={16}/></span><span className="page-name">{label}</span><button type="button" aria-label={'Subir '+label} onClick={()=>move(page.id,-1)} disabled={index===0}><ChevronUp size={14}/></button><button type="button" aria-label={'Bajar '+label} onClick={()=>move(page.id,1)} disabled={index===pages.length-1}><ChevronDown size={14}/></button><input type="checkbox" checked={page.enabled} disabled={last} aria-label={'Mostrar '+label} onChange={()=>setPages(current=>togglePage(current,page.id))}/></li>
 })}</ol><small>Al menos una página debe permanecer activa.</small></section>
}

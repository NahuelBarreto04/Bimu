import {useEffect} from 'react'
import {invoke} from '@tauri-apps/api/core'
// Measure during CSS transitions too: the native window is larger than its UI.
export function useHitRegions(native){
 useEffect(()=>{
  if(!native)return
  let gone=false,pending=false,last=''
  const measure=async()=>{
   if(pending||gone)return
   const regions=[...document.querySelectorAll('.notch-surface,.glass-shell,.quick-shell,.drop-surface,.wake-bubble,.desktop-error')].filter(el=>!el.hidden&&getComputedStyle(el).visibility!=='hidden').map(el=>{
    const r=el.getBoundingClientRect(),s=getComputedStyle(el)
    return {x:r.x,y:r.y,width:r.width,height:r.height,radii:['borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius'].map(k=>parseFloat(s[k])||0)}
   }).filter(r=>r.width>0&&r.height>0)
   const key=JSON.stringify(regions);if(key===last)return
   pending=true
   try{await invoke('desktop_hit_regions',{regions});last=key}catch{/* Keep the last usable region if the native bridge is unavailable. */}finally{pending=false}
  }
  measure();const timer=setInterval(measure,40)
  return()=>{gone=true;clearInterval(timer);invoke('desktop_hit_regions',{regions:[]}).catch(()=>{})}
 },[native])
}

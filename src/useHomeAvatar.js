import {useLayoutEffect} from 'react'
// The 3D canvas remains mounted; anchor its overlay to the scrolling home card.
export function useHomeAvatar(active){
 useLayoutEffect(()=>{
  if(!active)return
  const root=document.documentElement,surface=document.querySelector('.desktop'),body=surface?.querySelector('.hub-body'),card=body?.querySelector('.companion-card')
  if(!surface||!body||!card)return
  const measure=()=>{
   const s=surface.getBoundingClientRect(),b=body.getBoundingClientRect(),c=card.getBoundingClientRect()
   const lateral=['left','right'].includes(root.dataset.edge),height=lateral?151:160,top=c.top+16
   root.style.setProperty('--home-avatar-left',`${c.left-s.left+10}px`)
   root.style.setProperty('--home-avatar-top',`${top-s.top}px`)
   root.style.setProperty('--home-avatar-clip-top',`${Math.max(0,b.top-top)}px`)
   root.style.setProperty('--home-avatar-clip-bottom',`${Math.max(0,top+height-b.bottom)}px`)
   root.dataset.homeAvatarVisible=String(c.bottom>b.top&&c.top<b.bottom)
  }
  measure()
  const observer=new ResizeObserver(measure)
  for(const el of [surface,body,card,body.querySelector('.assistant-results')])if(el)observer.observe(el)
  body.addEventListener('scroll',measure,{passive:true});window.addEventListener('resize',measure)
  return()=>{observer.disconnect();body.removeEventListener('scroll',measure);window.removeEventListener('resize',measure);delete root.dataset.homeAvatarVisible}
 })
}

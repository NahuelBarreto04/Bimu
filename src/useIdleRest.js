import {useEffect,useRef,useCallback} from 'react'
export const IDLE_REST_MS=10*60*1000
// Only interaction with the companion and recognized wake requests renew this timer.
export function useIdleRest({enabled,onRest,onWake,busy=false,delay=IDLE_REST_MS}){
 const latest=useRef({onRest,onWake,busy});latest.current={onRest,onWake,busy}
 const timer=useRef(),sleeping=useRef(false)
 const activity=useCallback(()=>{
  clearTimeout(timer.current)
  if(sleeping.current){sleeping.current=false;latest.current.onWake()}
  if(enabled&&!latest.current.busy)timer.current=setTimeout(()=>{if(!latest.current.busy){sleeping.current=true;latest.current.onRest()}},delay)
 },[enabled,delay])
 useEffect(()=>{
  if(!enabled)return
  activity()
  const surface=document.querySelector('.desktop')
  const events=['pointerdown','pointermove','keydown','input','dragenter']
  events.forEach(event=>surface?.addEventListener(event,activity))
  return()=>{clearTimeout(timer.current);events.forEach(event=>surface?.removeEventListener(event,activity))}
 },[enabled,busy,activity])
 return activity
}

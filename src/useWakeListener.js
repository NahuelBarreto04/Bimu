import {useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {listen} from '@tauri-apps/api/event'
import {pcmToWav,microphoneError,normalizeTranscript} from './voice-audio'
import {wakeIntent,ARM_WINDOW_MS} from './wake-policy'
export function useWakeListener({native,device,busy,onRequest,onFeedback}){
 const [enabled,setEnabled]=useState(false),[phase,setPhase]=useState('off'),[error,setError]=useState(''),[last,setLast]=useState(''),[threshold,setThresholdState]=useState(.008)
 const active=useRef(false),resources=useRef(null),epoch=useRef(0),job=useRef(0),request=useRef(null),processing=useRef(false),speechActive=useRef(false),armedForPhrase=useRef(false),armedUntil=useRef(0),armTimer=useRef(),mounted=useRef(true),latest=useRef({device,busy,onRequest,onFeedback,threshold}),cooldown=useRef(0)
 latest.current={device,busy,onRequest,onFeedback,threshold}
 const configure=enabled=>resources.current?.node?.port.postMessage({type:'config',enabled,threshold:latest.current.threshold})
 const abortJob=()=>{job.current++;processing.current=false;speechActive.current=false;armedForPhrase.current=false;const id=request.current;request.current=null;if(id)invoke('voice_cancel',{requestId:id}).catch(()=>{})}
 const stop=()=>{
  active.current=false;epoch.current++;abortJob();armedUntil.current=0;clearTimeout(armTimer.current)
  const r=resources.current;resources.current=null
  if(r){r.node?.disconnect();r.source?.disconnect();r.mute?.disconnect();r.stream.getTracks().forEach(t=>{t.onended=null;t.stop()});r.context?.close().catch(()=>{})}
  if(mounted.current){setEnabled(false);setPhase('off')}
 }
 const ready=()=>{if(!active.current||!resources.current?.node||processing.current)return;const paused=latest.current.busy;configure(!paused);setPhase(paused?'paused':Date.now()<armedUntil.current?'armed':'listening')}
 const receive=async(data,session)=>{
  if(!active.current||epoch.current!==session||latest.current.busy)return
  if(data.type==='speech'){speechActive.current=true;armedForPhrase.current=Date.now()<armedUntil.current;setPhase('speech');return}
  if(data.type!=='utterance')return
  speechActive.current=false;const phraseArmed=armedForPhrase.current||Date.now()<armedUntil.current;armedForPhrase.current=false
  if(data.clipped){latest.current.onFeedback?.('error','La frase fue demasiado larga. Probá un pedido más corto.');ready();return}
  if(Date.now()<cooldown.current){ready();return}
  if(processing.current)return
  processing.current=true;const ticket=++job.current;configure(false);setPhase('transcribing');setError('')
  const valid=()=>active.current&&epoch.current===session&&job.current===ticket&&mounted.current
  try{
   const wav=await pcmToWav(data.samples,data.rate);if(!valid())return
   const requestId=crypto.randomUUID();request.current=requestId
   const text=await invoke('voice_transcribe',{requestId,audio:Array.from(wav),handsFree:true});if(!valid())return;request.current=null
   if(latest.current.busy)return
   const intent=wakeIntent(normalizeTranscript(text),phraseArmed)
   if(intent.kind==='arm'){armedUntil.current=Date.now()+ARM_WINDOW_MS;clearTimeout(armTimer.current);armTimer.current=setTimeout(()=>{armedUntil.current=0;if(active.current&&!processing.current&&!speechActive.current){latest.current.onFeedback?.('warning','No te escuché. Decí “Bimu” para intentarlo otra vez.');ready()}},ARM_WINDOW_MS)}
   if(intent.kind==='arm')latest.current.onFeedback?.('idle','Te escucho…')
   if(intent.kind==='ignore'&&phraseArmed)latest.current.onFeedback?.('error','No entendí el pedido. Probá otra vez.')
   if(intent.kind==='cancel'){armedUntil.current=0;clearTimeout(armTimer.current);setLast('Pedido cancelado')}
   if(intent.kind==='request'){
    armedUntil.current=0;clearTimeout(armTimer.current)
    // Drop overlays own their interaction until the user finishes them.
    if(document.documentElement.dataset.receive&&document.documentElement.dataset.receive!=='idle')return
    cooldown.current=Date.now()+2000;setLast(intent.text);await latest.current.onRequest(intent.text)
   }
  }catch(e){if(valid()&&phraseArmed&&/No se reconocieron palabras|No se detectó suficiente audio/i.test(String(e.message||e)))latest.current.onFeedback?.('warning','No te escuché. Probá otra vez.');if(valid()&&!/No se reconocieron palabras|No se detectó suficiente audio/i.test(String(e.message||e))){setError(microphoneError(e));latest.current.onFeedback?.('error',microphoneError(e));stop()}}
  finally{if(valid()){request.current=null;processing.current=false;ready()}}
 }
 const start=async()=>{
  if(active.current)return
  if(!native){setError('Abrí Bimu en el escritorio para activar la escucha local.');return}
  if(latest.current.busy){setError('Terminá la operación actual antes de activar la escucha.');return}
  if(!navigator.mediaDevices?.getUserMedia||typeof AudioWorkletNode==='undefined'){setError('La escucha necesita acceso al micrófono y WebView2 actualizado.');return}
  active.current=true;const session=++epoch.current;setEnabled(true);setPhase('starting');setError('');setLast('')
  let stream,context
  try{
   await invoke('voice_status');if(!active.current||epoch.current!==session)return
   stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{...(latest.current.device?{deviceId:{exact:latest.current.device}}:{}),channelCount:1,echoCancellation:true,noiseSuppression:true}})
   if(!active.current||epoch.current!==session){stream.getTracks().forEach(t=>t.stop());return}
   context=new AudioContext({sampleRate:16000});resources.current={stream,context};await context.resume()
   await context.audioWorklet.addModule(new URL('./wake-processor.js',document.baseURI).href)
   if(!active.current||epoch.current!==session){stream.getTracks().forEach(t=>t.stop());await context.close().catch(()=>{});return}
   const node=new AudioWorkletNode(context,'bimu-speech'),source=context.createMediaStreamSource(stream),mute=context.createGain();mute.gain.value=0
   resources.current={stream,context,node,source,mute};node.port.onmessage=({data})=>receive(data,session)
   source.connect(node);node.connect(mute);mute.connect(context.destination)
   stream.getTracks().forEach(track=>{track.onended=()=>{if(active.current){setError('El micrófono se desconectó. Volvé a seleccionarlo y activá la escucha.');stop()}}})
   ready()
  }catch(e){stream?.getTracks().forEach(t=>t.stop());context?.close().catch(()=>{});if(active.current&&epoch.current===session){setError(microphoneError(e));latest.current.onFeedback?.('error',microphoneError(e));stop()}}
 }
 const setThreshold=value=>{const n=Math.max(.002,Math.min(.04,Number(value)));if(!Number.isFinite(n))return;setThresholdState(n);latest.current.threshold=n;if(active.current&&!request.current)configure(!latest.current.busy)}
 useEffect(()=>{if(!active.current)return;if(busy){abortJob();armedUntil.current=0;clearTimeout(armTimer.current);configure(false);setPhase('paused')}else if(resources.current?.node)ready()},[busy])
 useEffect(()=>{mounted.current=true;let disposed=false,off
  if(native)listen('bimu-voice-cancel',stop).then(fn=>{if(disposed)fn();else off=fn}).catch(()=>{})
  const hidden=()=>{if(document.hidden)stop()};document.addEventListener('visibilitychange',hidden)
  return()=>{disposed=true;off?.();mounted.current=false;stop();document.removeEventListener('visibilitychange',hidden)}
 },[native])
 return {enabled,phase,error,last,threshold,start,stop,setThreshold}
}

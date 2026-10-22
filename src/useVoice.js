import {useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {listen} from '@tauri-apps/api/event'
import {MAX_RECORDING_SECONDS,recordingToWav,microphoneError,normalizeTranscript} from './voice-audio'
export function useVoice({native,enabled,busy,onTranscript}){
  const [stage,setStage]=useState('idle'),[seconds,setSeconds]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [devices,setDevices]=useState([]),[device,setDeviceState]=useState(()=>{try{return localStorage.getItem('bimu-microphone')||''}catch{return ''}})
  const [detecting,setDetecting]=useState(false),[engine,setEngine]=useState('unknown')
  const recording=useRef(null),sequence=useRef(0),request=useRef(null),mounted=useRef(true),state=useRef('idle'),latest=useRef({enabled,busy,onTranscript})
  latest.current={enabled,busy,onTranscript}
  const update=value=>{state.current=value;if(mounted.current)setStage(value)}
  const release=()=>{const r=recording.current;if(!r)return;clearInterval(r.timer);r.stream.getTracks().forEach(t=>{t.onended=null;t.stop()});recording.current=null;return r}
  const cancel=()=>{
    sequence.current++;const id=request.current;request.current=null
    if(native&&id)invoke('voice_cancel',{requestId:id}).catch(()=>{})
    const r=release();if(r&&r.recorder.state!=='inactive'){r.recorder.onstop=null;r.recorder.stop()}
    update('idle');if(mounted.current){setSeconds(0);setNotice('')}
  }
  const listDevices=async()=>{const list=await navigator.mediaDevices.enumerateDevices();if(mounted.current)setDevices(list.filter(d=>d.kind==='audioinput'))}
  const detect=async()=>{
    if(detecting||state.current!=='idle')return
    setDetecting(true);setError('');let stream
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error('El micrófono no está disponible en esta ventana. Abrí la aplicación de escritorio y actualizá WebView2.')
      const op=sequence.current;stream=await navigator.mediaDevices.getUserMedia({audio:true})
      if(!mounted.current||sequence.current!==op)return
      await listDevices();setNotice('Micrófonos detectados. El permiso no deja la grabación encendida.')
    }catch(e){if(mounted.current)setError(microphoneError(e))}finally{stream?.getTracks().forEach(t=>t.stop());if(mounted.current)setDetecting(false)}
  }
  const checkEngine=async()=>{
    if(!native){setError('La transcripción local está disponible en la aplicación de escritorio.');return}
    setEngine('checking');setError('')
    try{await invoke('voice_status');if(mounted.current)setEngine('ready')}
    catch(e){if(mounted.current){setEngine('offline');setError(String(e.message||e))}}
  }
  const setDevice=value=>{if(state.current!=='idle'||detecting)return;setDeviceState(value);try{localStorage.setItem('bimu-microphone',value)}catch{setError('No se pudo guardar el micrófono elegido.')}}
  const stop=()=>{const r=recording.current;if(state.current!=='recording'||!r)return;update('transcribing');clearInterval(r.timer);r.recorder.stop();release()}
  const start=async()=>{
    if(state.current!=='idle'||detecting||latest.current.busy||!latest.current.enabled)return
    if(!native){setError('Abrí Bimu en el escritorio para usar la transcripción local.');return}
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setError('No hay acceso al micrófono. Revisá los permisos de Windows y actualizá WebView2.');return}
    const op=++sequence.current;update('starting');setError('');setNotice('');setSeconds(0)
    let stream
    try{
      await invoke('voice_status');if(sequence.current!==op||!mounted.current)return;setEngine('ready')
      stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{...(device?{deviceId:{exact:device}}:{}),channelCount:1,echoCancellation:true,noiseSuppression:true}})
      if(sequence.current!==op||!mounted.current){stream.getTracks().forEach(t=>t.stop());return}
      await listDevices()
      if(sequence.current!==op||!mounted.current){stream.getTracks().forEach(t=>t.stop());return}
      const mime=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t))
      const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined),chunks=[];let bytes=0
      recorder.ondataavailable=e=>{if(sequence.current!==op||!mounted.current)return;if(e.data.size){bytes+=e.data.size;if(bytes>8000000){cancel();setError('La grabación es demasiado grande. Probá una frase más corta.');return}chunks.push(e.data)}}
      recorder.onerror=()=>{if(sequence.current!==op||!mounted.current)return;cancel();setError('Falló la grabación. Revisá el micrófono y volvé a intentar.')}
      recorder.onstop=async()=>{
        if(sequence.current!==op||!mounted.current)return
        release();update('transcribing')
        try{
          const wav=await recordingToWav(new Blob(chunks,{type:recorder.mimeType}))
          if(sequence.current!==op||!mounted.current)return
          const requestId=crypto.randomUUID();request.current=requestId
          const text=await invoke('voice_transcribe',{requestId,audio:Array.from(wav)})
          if(sequence.current!==op||!mounted.current)return
          const transcript=normalizeTranscript(text)
          if(!transcript)throw Error('No se reconocieron palabras. Volvé a intentar.')
          latest.current.onTranscript(transcript);setNotice('Transcripción lista. Revisala antes de enviarla.')
        }catch(e){if(sequence.current===op&&mounted.current)setError(microphoneError(e))}
        finally{if(sequence.current===op&&mounted.current){request.current=null;update('idle');setSeconds(0)}}
      }
      const started=performance.now();recording.current={stream,recorder,timer:null};recorder.start(250);update('recording')
      stream.getAudioTracks().forEach(track=>{track.onended=()=>{if(state.current==='recording'){cancel();setError('El micrófono se desconectó. Elegí otro en Ajustes.')}}})
      recording.current.timer=setInterval(()=>{const elapsed=(performance.now()-started)/1000;setSeconds(Math.min(MAX_RECORDING_SECONDS,Math.floor(elapsed)));if(elapsed>=MAX_RECORDING_SECONDS)stop()},200)
    }catch(e){stream?.getTracks().forEach(t=>t.stop());if(sequence.current===op&&mounted.current){release();update('idle');setError(microphoneError(e))}}
  }
  useEffect(()=>{
    mounted.current=true
    const media=navigator.mediaDevices
    const changed=()=>listDevices().catch(()=>{})
    changed();media?.addEventListener?.('devicechange',changed)
    let off,disposed=false
    if(native)listen('bimu-voice-cancel',cancel).then(fn=>{if(disposed)fn();else off=fn}).catch(()=>{})
    const hidden=()=>{if(document.hidden)cancel()};document.addEventListener('visibilitychange',hidden)
    return()=>{disposed=true;off?.();mounted.current=false;cancel();media?.removeEventListener?.('devicechange',changed);document.removeEventListener('visibilitychange',hidden)}
  },[])
  useEffect(()=>{if(!enabled||busy)cancel()},[enabled,busy])
  return {stage,seconds,error,notice,devices,device,detecting,engine,active:stage!=='idle',start,stop,cancel,detect,setDevice,checkEngine}
}

export const MAX_RECORDING_SECONDS=30
export const WAV_RATE=16000
export function encodeWav(samples,rate=WAV_RATE){
  if(rate!==WAV_RATE||samples.length>rate*MAX_RECORDING_SECONDS)throw Error('La grabación supera los 30 segundos.')
  let energy=0
  const bytes=new Uint8Array(44+samples.length*2),view=new DataView(bytes.buffer)
  const text=(offset,value)=>[...value].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)))
  text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples.length*2,true)
  for(let i=0;i<samples.length;i++){const sample=Math.max(-1,Math.min(1,Number.isFinite(samples[i])?samples[i]:0));energy+=sample*sample;view.setInt16(44+i*2,Math.round(sample*(sample<0?32768:32767)),true)}
  return {bytes,rms:Math.sqrt(energy/Math.max(1,samples.length)),duration:samples.length/rate}
}
export async function recordingToWav(blob){
  const context=new AudioContext()
  try{
    const audio=await context.decodeAudioData(await blob.arrayBuffer())
    if(audio.duration<0.3)throw Error('Grabación muy corta. Probá hablar durante al menos un segundo.')
    const length=Math.min(Math.ceil(audio.duration*WAV_RATE),WAV_RATE*MAX_RECORDING_SECONDS)
    const offline=new OfflineAudioContext(1,length,WAV_RATE),source=offline.createBufferSource();source.buffer=audio;source.connect(offline.destination);source.start()
    const rendered=await offline.startRendering(),result=encodeWav(rendered.getChannelData(0))
    if(result.rms<0.002)throw Error('No se detectó suficiente audio. Revisá el micrófono y volvé a intentar.')
    return result.bytes
  }finally{await context.close().catch(()=>{})}
}
export function microphoneError(error){
  return ({NotAllowedError:'No se autorizó el micrófono. Permití el acceso y revisá Privacidad → Micrófono en Windows.',NotFoundError:'No hay un micrófono disponible.',NotReadableError:'No se pudo abrir el micrófono. Puede estar ocupado por otra aplicación.',OverconstrainedError:'Ese micrófono ya no está disponible. Elegí otro en Ajustes.'})[error?.name]||String(error?.message||error)
}

// Whisper server inserts line breaks between segments; a dictation is one draft.
export function normalizeTranscript(text){
  return typeof text==='string'?text.replace(/\s+/gu,' ').trim():''
}
export function normalizeSpeech(samples){
 let sum=0,peak=0;for(const s of samples){const value=Number.isFinite(s)?s:0;sum+=value*value;peak=Math.max(peak,Math.abs(value))}
 const rms=Math.sqrt(sum/Math.max(1,samples.length))
 if(!peak||!rms)return samples
 const gain=Math.max(1,Math.min(6,.08/rms,.92/peak))
 if(gain===1)return samples
 return Float32Array.from(samples,s=>(Number.isFinite(s)?s:0)*gain)
}
export async function pcmToWav(samples,rate,{normalize=false}={}){
 if(!(samples instanceof Float32Array)||!Number.isFinite(rate)||rate<8000||rate>192000||samples.length>rate*MAX_RECORDING_SECONDS)throw Error('Audio de escucha inválido.')
 if(rate===WAV_RATE)return encodeWav(normalize?normalizeSpeech(samples):samples).bytes
 const length=Math.ceil(samples.length/rate*WAV_RATE),offline=new OfflineAudioContext(1,length,WAV_RATE)
 const buffer=offline.createBuffer(1,samples.length,rate);buffer.copyToChannel(samples,0);const source=offline.createBufferSource();source.buffer=buffer;source.connect(offline.destination);source.start();const rendered=await offline.startRendering();const pcm=rendered.getChannelData(0);return encodeWav(normalize?normalizeSpeech(pcm):pcm).bytes
}

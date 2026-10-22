import test from 'node:test'
import assert from 'node:assert/strict'
import {encodeWav,microphoneError,normalizeTranscript} from '../src/voice-audio.js'
test('codifica WAV PCM mono 16 kHz con tamaños exactos y saturación correcta',()=>{
 const {bytes,rms,duration}=encodeWav(Float32Array.from([-2,-1,0,1,2,NaN]))
 const view=new DataView(bytes.buffer),text=(a,b)=>new TextDecoder().decode(bytes.slice(a,b))
 assert.equal(text(0,4),'RIFF');assert.equal(text(8,12),'WAVE');assert.equal(text(36,40),'data');assert.equal(view.getUint32(4,true),bytes.length-8);assert.equal(view.getUint32(40,true),12);assert.equal(view.getUint32(24,true),16000);assert.equal(view.getUint16(22,true),1);assert.equal(view.getUint16(34,true),16)
 assert.deepEqual(Array.from({length:6},(_,i)=>view.getInt16(44+i*2,true)),[-32768,-32768,0,32767,32767,0]);assert.ok(rms>0);assert.equal(duration,6/16000)
})
test('limita duración y maneja silencio sin NaN',()=>{
 assert.equal(encodeWav(new Float32Array(16000)).rms,0);assert.equal(encodeWav(new Float32Array()).rms,0)
 assert.equal(encodeWav(new Float32Array(30*16000)).bytes.length,960044)
 assert.throws(()=>encodeWav(new Float32Array(30*16000+1)),/30 segundos/)
})
test('distingue permiso, dispositivo ausente y micrófono ocupado',()=>{
 assert.match(microphoneError({name:'NotAllowedError'}),/autorizó/);assert.match(microphoneError({name:'NotFoundError'}),/disponible/);assert.match(microphoneError({name:'NotReadableError'}),/ocupado/);assert.match(microphoneError({name:'OverconstrainedError'}),/Elegí otro/)
})

test('normaliza segmentos del dictado sin reescribir palabras ni puntuación',()=>{
 assert.equal(normalizeTranscript('  Hola, Bimu.\n Esta es una prueba\r\n del micrófono.  '),'Hola, Bimu. Esta es una prueba del micrófono.')
 assert.equal(normalizeTranscript('Qué\t tal\n  funciona'),'Qué tal funciona')
 assert.equal(normalizeTranscript('Hola vimos, dictado provoso.'),'Hola vimos, dictado provoso.')
 assert.equal(normalizeTranscript('   \n '),'');assert.equal(normalizeTranscript(null),'')
})

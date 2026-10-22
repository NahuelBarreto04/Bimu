import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {wakeIntent} from '../src/wake-policy.js'
test('solo activa solicitudes dirigidas a Bimu y permite una segunda frase armada',()=>{
 assert.deepEqual(wakeIntent('Hola Bimu, abrí Spotify.'),{kind:'request',text:'abrí Spotify.'})
 assert.deepEqual(wakeIntent('Oye Bimu'),{kind:'arm'})
 assert.deepEqual(wakeIntent('abrí Spotify'),{kind:'ignore'})
 assert.deepEqual(wakeIntent('hablamos de Bimu y Spotify'),{kind:'ignore'})
 assert.deepEqual(wakeIntent('Bimusic abrí Spotify'),{kind:'ignore'})
 assert.deepEqual(wakeIntent('Abrí Calculadora',true),{kind:'request',text:'Abrí Calculadora'})
 assert.deepEqual(wakeIntent('Bimu, cancelá.'),{kind:'cancel'})
})
function processor(){let Processor;const messages=[];const context=vm.createContext({Float32Array,Math,Number,sampleRate:16000,AudioWorkletProcessor:class{constructor(){this.port={postMessage:m=>messages.push(m)}}},registerProcessor:(_,klass)=>Processor=klass});vm.runInContext(readFileSync(new URL('../public/wake-processor.js',import.meta.url),'utf8'),context);const p=new Processor();p.port.onmessage({data:{type:'config',enabled:true,threshold:.008}});const feed=(seconds,volume)=>{for(let n=0;n<Math.ceil(seconds*16000/128);n++)p.process([[new Float32Array(128).fill(volume)]],[[new Float32Array(128)]])};return {p,messages,feed}}
test('VAD no envía silencio, conserva pre-roll y cierra una frase al terminar de hablar',()=>{
 const {messages,feed}=processor();feed(2,0);assert.equal(messages.length,0);feed(.6,.1);feed(1.1,0);const result=messages.find(m=>m.type==='utterance');assert.ok(result);assert.equal(result.clipped,false);assert.ok(result.samples.length<=16000*2);assert.ok(result.samples.some(s=>s>.05));const count=messages.length;feed(2,.1);assert.equal(messages.length,count,'espera reactivación mientras se transcribe')
})
test('pausar descarta la frase y limita audio continuo a quince segundos',()=>{
 const {p,messages,feed}=processor();feed(.4,.1);p.port.onmessage({data:{type:'config',enabled:false}});feed(2,0);assert.equal(messages.some(m=>m.type==='utterance'),false);p.port.onmessage({data:{type:'config',enabled:true}});feed(16,.1);assert.equal(messages.find(m=>m.type==='utterance').clipped,true)
})

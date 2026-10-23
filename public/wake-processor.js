// Bounded speech segmentation and aggregate levels. Calibration never sends audio.
class BimuSpeechProcessor extends AudioWorkletProcessor {
 constructor(){
  super();this.enabled=false;this.meter=false;this.threshold=.008;this.noiseFloor=null;this.silenceMs=1200;this.levelSamples=0
  this.ring=new Float32Array(Math.ceil(sampleRate*.8));this.head=0;this.filled=0;this.reset()
  this.port.onmessage=({data})=>{
   if(data.type==='meter'){this.meter=!!data.enabled;return}
   if(data.type==='calibrate'){this.enabled=false;this.reset();this.filled=0;this.calibration={levels:[],length:0};return}
   if(data.type==='cancel-calibration'){this.calibration=null;this.reset();this.filled=0;return}
   if(data.type!=='config')return
   this.enabled=!!data.enabled;if('meter' in data)this.meter=!!data.meter
   if([700,1200,1600].includes(data.silenceMs))this.silenceMs=data.silenceMs
   if(Number.isFinite(data.threshold))this.threshold=Math.max(.0005,Math.min(.04,data.threshold))
   this.noiseFloor=Number.isFinite(data.noiseFloor)?Math.max(.0001,Math.min(.04,data.noiseFloor)):null
   this.calibration=null;this.reset();this.ring.fill(0);this.head=0;this.filled=0
  }
 }
 reset(){this.chunks=[];this.length=0;this.quiet=0;this.hot=0;this.speaking=false}
 trigger(){return this.noiseFloor===null?this.threshold:Math.max(.0005,this.threshold*.15,this.noiseFloor*(1.6+Math.min(1,(this.threshold-.0005)/.0245)*3.4))}
 previous(){const out=new Float32Array(this.filled);for(let i=0;i<this.filled;i++)out[i]=this.ring[(this.head-this.filled+i+this.ring.length)%this.ring.length];return out}
 finish(clipped){const trim=clipped?0:Math.max(0,this.quiet-Math.floor(sampleRate*.2)),size=Math.max(0,this.length-trim),samples=new Float32Array(size);let at=0;for(const chunk of this.chunks){const n=Math.min(chunk.length,size-at);if(n<=0)break;samples.set(chunk.subarray(0,n),at);at+=n}this.port.postMessage({type:'utterance',samples,rate:sampleRate,clipped},[samples.buffer]);this.reset();this.enabled=false;this.filled=0}
 process(inputs,outputs){
  for(const channel of outputs[0]||[])channel.fill(0)
  const input=inputs[0];if(!input?.length)return true
  if(!this.enabled&&!this.meter&&!this.calibration)return true
  const mono=new Float32Array(input[0].length);for(const channel of input)for(let i=0;i<mono.length;i++)mono[i]+=(channel[i]||0)/input.length
  let sum=0,peak=0;for(const s of mono){sum+=s*s;peak=Math.max(peak,Math.abs(s))}const rms=Math.sqrt(sum/Math.max(1,mono.length)),trigger=this.trigger()
  this.levelSamples+=mono.length
  if(this.meter&&this.levelSamples>=sampleRate*.2){this.levelSamples=0;this.port.postMessage({type:'level',rms,peak,threshold:trigger,speaking:this.speaking,calibrationProgress:this.calibration?Math.min(1,this.calibration.length/(sampleRate*2)):0})}
  if(this.calibration){
   const c=this.calibration;c.levels.push(rms);c.length+=mono.length
   if(c.length>=sampleRate*2){c.levels.sort((a,b)=>a-b);const floor=c.levels[Math.floor((c.levels.length-1)*.8)];this.calibration=null;this.reset();this.filled=0;this.port.postMessage({type:'calibrated',noiseFloor:Math.max(.0001,floor),tooNoisy:floor>.02})}
   return true
  }
  if(!this.enabled)return true
  if(!this.speaking){
   // Brief dips no longer discard an otherwise continuous, quiet syllable.
   this.hot=rms>=trigger?this.hot+mono.length:Math.max(0,this.hot-mono.length*2)
   if(this.hot>=sampleRate*.06){const pre=this.previous();this.chunks=[pre];this.length=pre.length;this.speaking=true;this.port.postMessage({type:'speech'})}
  }
  if(this.speaking){this.chunks.push(mono);this.length+=mono.length;this.quiet=rms<trigger*.8?this.quiet+mono.length:0;if(this.length>=sampleRate*15){this.finish(true);return true}if(this.quiet>=sampleRate*this.silenceMs/1000){this.finish(false);return true}}
  for(const s of mono){this.ring[this.head]=s;this.head=(this.head+1)%this.ring.length;this.filled=Math.min(this.filled+1,this.ring.length)}return true
 }
}
registerProcessor('bimu-speech',BimuSpeechProcessor)

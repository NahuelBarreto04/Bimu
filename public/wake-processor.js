// Local speech segmentation. Only bounded utterances with energy are forwarded;
// the main thread decides whether the recognized phrase addresses Bimu.
class BimuSpeechProcessor extends AudioWorkletProcessor {
 constructor(){super();this.enabled=false;this.threshold=.008;this.silenceMs=1200;this.ring=new Float32Array(Math.ceil(sampleRate*.8));this.head=0;this.filled=0;this.reset();this.port.onmessage=({data})=>{if(data.type==='config'){this.enabled=!!data.enabled;if([700,1200,1600].includes(data.silenceMs))this.silenceMs=data.silenceMs;if(Number.isFinite(data.threshold))this.threshold=Math.max(.002,Math.min(.04,data.threshold));this.reset();this.ring.fill(0);this.head=0;this.filled=0}}}
 reset(){this.chunks=[];this.length=0;this.quiet=0;this.hot=0;this.speaking=false}
 previous(){const out=new Float32Array(this.filled);for(let i=0;i<this.filled;i++)out[i]=this.ring[(this.head-this.filled+i+this.ring.length)%this.ring.length];return out}
 finish(clipped){const trim=clipped?0:Math.max(0,this.quiet-Math.floor(sampleRate*.2)),size=Math.max(0,this.length-trim),samples=new Float32Array(size);let at=0;for(const chunk of this.chunks){const n=Math.min(chunk.length,size-at);if(n<=0)break;samples.set(chunk.subarray(0,n),at);at+=n}this.port.postMessage({type:'utterance',samples,rate:sampleRate,clipped},[samples.buffer]);this.reset();this.enabled=false;this.filled=0}
 process(inputs,outputs){for(const channel of outputs[0]||[])channel.fill(0);const input=inputs[0];if(!this.enabled||!input?.length)return true;
  const mono=new Float32Array(input[0].length);for(const channel of input)for(let i=0;i<mono.length;i++)mono[i]+=(channel[i]||0)/input.length;
  let sum=0;for(const s of mono)sum+=s*s;const rms=Math.sqrt(sum/Math.max(1,mono.length));
  if(!this.speaking){this.hot=rms>=this.threshold?this.hot+mono.length:0;if(this.hot>=sampleRate*.06){const pre=this.previous();this.chunks=[pre];this.length=pre.length;this.speaking=true;this.port.postMessage({type:'speech'})}}
  if(this.speaking){this.chunks.push(mono);this.length+=mono.length;this.quiet=rms<this.threshold*.65?this.quiet+mono.length:0;if(this.length>=sampleRate*15){this.finish(true);return true}if(this.quiet>=sampleRate*this.silenceMs/1000){this.finish(false);return true}}
  for(const s of mono){this.ring[this.head]=s;this.head=(this.head+1)%this.ring.length;this.filled=Math.min(this.filled+1,this.ring.length)}return true
 }
}
registerProcessor('bimu-speech',BimuSpeechProcessor)

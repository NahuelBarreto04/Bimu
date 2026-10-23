// Aggregate only: no recordings, transcripts or filenames are retained.
export const emptyWakeMetrics=()=>({count:0,activated:0,ignored:0,errors:0,clipped:0,audioMs:0,processingMs:0,lastMs:0,maxMs:0,missed:0,falseActivations:0})
export function addWakeMetric(stats,{kind,audioMs=0,processingMs=0}){
 const ms=Math.max(0,Number.isFinite(processingMs)?processingMs:0)
 return {...stats,count:stats.count+1,activated:stats.activated+(['arm','request','cancel'].includes(kind)?1:0),ignored:stats.ignored+(kind==='ignore'?1:0),errors:stats.errors+(kind==='error'?1:0),clipped:stats.clipped+(kind==='clipped'?1:0),audioMs:stats.audioMs+Math.max(0,audioMs||0),processingMs:stats.processingMs+ms,lastMs:ms,maxMs:Math.max(stats.maxMs,ms)}
}
export function loadWakeSettings(){
 try{const s=JSON.parse(localStorage.getItem('bimu-wake-settings')||'{}'),c=s.calibration;return {threshold:Number.isFinite(s.threshold)?s.version!==2&&s.threshold<=.002001?.0005:Math.max(.0005,Math.min(.025,s.threshold)):.008,silenceMs:[700,1200,1600].includes(s.silenceMs)?s.silenceMs:1200,calibration:c&&typeof c.device==='string'&&c.device.length<=512&&Number.isFinite(c.noiseFloor)&&c.noiseFloor>=.0001&&c.noiseFloor<=.02?{device:c.device,noiseFloor:c.noiseFloor}:null}}catch{return {threshold:.008,silenceMs:1200,calibration:null}}
}

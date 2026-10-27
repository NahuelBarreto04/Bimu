export function parseSyncedLyrics(input){
 const result=[]
 for(const raw of String(input||'').split(/\r?\n/)){
  const tags=[...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
  const text=raw.replace(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g,'').trim()
  if(!text)continue
  for(const tag of tags){const seconds=Number(tag[1])*60+Number(tag[2])+Number('0.'+(tag[3]||'0'));if(Number(tag[2])<60)result.push({time:seconds,text})}
 }
 return result.sort((a,b)=>a.time-b.time)
}
export function lyricIndex(lines,seconds){let index=-1;for(let i=0;i<lines.length;i++){if(lines[i].time>seconds)break;index=i}return index}

export function readOpacity(){
 try{
  const saved=localStorage.getItem('bimu-ui-opacity')
  if(saved===null||!saved.trim())return 90
  const value=Number(saved)
  return Number.isFinite(value)?Math.min(100,Math.max(35,value)):90
 }catch{return 90}
}

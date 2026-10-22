export const EDGES=['top','bottom','left','right']
export const isLateral=edge=>edge==='left'||edge==='right'
export const clamp=(value,min,max)=>Math.max(min,Math.min(max,value))
export function notchSize(edge,state,size='M',tab='home') {
  const lateral=isLateral(edge)
  if(state==='open')return lateral?[430,tab==='home'?480:650]:[680,tab==='home'?350:570]
  const factor={S:.85,M:1,L:1.15}[size]||1
  const base=state==='peek'?(lateral?[92,208]:[238,78]):(lateral?[52,124]:[154,46])
  return base.map(n=>Math.round(n*factor))
}
// All values here are physical pixels, including negative monitor origins.
export function dockPosition(area,width,height,edge,fraction) {
  const offset=clamp(Number.isFinite(fraction)?fraction:.5,0,1)
  const x=clamp(area.x+area.width*offset-width/2,area.x,area.x+Math.max(0,area.width-width))
  const y=clamp(area.y+area.height*offset-height/2,area.y,area.y+Math.max(0,area.height-height))
  if(edge==='bottom')return {x:Math.round(x),y:Math.round(area.y+area.height-height)}
  if(edge==='left')return {x:Math.round(area.x),y:Math.round(y)}
  if(edge==='right')return {x:Math.round(area.x+area.width-width),y:Math.round(y)}
  return {x:Math.round(x),y:Math.round(area.y)}
}
export function slideOffset(start,delta,span,scale=1){
  const offset=clamp(start+delta/Math.max(1,span),0,1)
  return Math.abs(offset-.5)*span<=24*scale ? 0.5 : offset
}

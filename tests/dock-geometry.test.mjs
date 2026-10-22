import assert from 'node:assert/strict'
import {notchSize,dockPosition,slideOffset,transitionDuration,unionRects} from '../src/dock-geometry.js'
for(const area of [{x:0,y:0,width:1920,height:1040},{x:-2560,y:-200,width:2560,height:1440},{x:1920,y:0,width:3840,height:2080}]){
 for(const edge of ['top','bottom','left','right'])for(const scale of [1,1.25,2])for(const state of ['idle','peek','open'])for(const ratio of [0,.2,.5,.8,1]){
  const [w,h]=notchSize(edge,state,'M','settings');const width=Math.min(Math.round(w*scale),area.width),height=Math.min(Math.round(h*scale),area.height);const p=dockPosition(area,width,height,edge,ratio)
  assert.ok(p.x>=area.x&&p.x+width<=area.x+area.width+1);assert.ok(p.y>=area.y&&p.y+height<=area.y+area.height+1)
  if(edge==='top')assert.equal(p.y,area.y)
  if(edge==='bottom')assert.equal(p.y,area.y+area.height-height)
  if(edge==='left')assert.equal(p.x,area.x)
  if(edge==='right')assert.equal(p.x,area.x+area.width-width)
  if(ratio===.5){if(edge==='left'||edge==='right')assert.ok(Math.abs(p.y+height/2-(area.y+area.height/2))<=.5);else assert.ok(Math.abs(p.x+width/2-(area.x+area.width/2))<=.5)}
 }
}
assert.equal(slideOffset(.45,85,1920),.5);assert.equal(slideOffset(.45,180,3840,2),.5);assert.notEqual(slideOffset(.45,200,1920),.5)
assert.equal(slideOffset(.5,-9999,1920),0);assert.equal(slideOffset(.5,9999,1920),1)
assert.ok(notchSize('top','peek')[0]>notchSize('top','idle')[0]);assert.ok(notchSize('left','peek')[1]>notchSize('left','idle')[1])
console.log('OK: 540 combinaciones de posición, límites de monitor, centro, DPI y magnetismo.')

assert.ok(transitionDuration('peek','open')<transitionDuration('idle','peek'))
assert.equal(transitionDuration('idle','peek',true),0)
assert.equal(transitionDuration('peek','peek'),0)
assert.deepEqual(unionRects({x:-20,y:20,width:100,height:40},{x:-50,y:0,width:180,height:90}),{x:-50,y:0,width:180,height:90})
console.log('OK: aperturas parcial/completa y contenedor de animación.')

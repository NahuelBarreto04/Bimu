import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createNotchHoverController} from '../src/notch-hover.js'
test('focus loss from a removed or disabled button never closes a hovered notch',()=>{
 let opened=0,closed=0,task;const c=createNotchHoverController({surface:{contains:()=>false},open:()=>opened++,close:()=>closed++,setTimer:f=>(task=f,1),clearTimer:()=>{task=null}})
 c.pointerEnter();c.focusIn();c.focusOut({relatedTarget:null});assert.equal(closed,0);assert.equal(task,null)
 c.pointerLeave({relatedTarget:null});task();assert.equal(closed,1);assert.equal(opened,2)
})
test('keyboard focus stays open while moving between controls and closes after leaving',()=>{
 let closed=0,task;const child={};const c=createNotchHoverController({surface:{contains:x=>x===child},open:()=>{},close:()=>closed++,setTimer:f=>(task=f,1),clearTimer:()=>{task=null}})
 c.focusIn();c.focusOut({relatedTarget:child});assert.equal(task,null);c.focusOut({relatedTarget:null});task();assert.equal(closed,1)
})

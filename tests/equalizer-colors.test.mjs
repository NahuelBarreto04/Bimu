import {test} from 'node:test'
import assert from 'node:assert/strict'
import {equalizerColors,contrast} from '../src/equalizer-colors.js'
const rgb=s=>s.match(/\d+/g).map(Number)
test('both equalizer colors contrast against light and dark custom backgrounds',()=>{
 for(const hex of ['#ffffff','#f5ebff','#f8dd40','#171820','#000000','#30085c','#1e6644','#9b9b9b']){
  const bg=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)),colors=equalizerColors(bg,hex)
  assert.ok(contrast(rgb(colors.base),bg)>=3,hex+' base')
  assert.ok(contrast(rgb(colors.accent),bg)>=3,hex+' accent')
 }
})
test('neutral dark background retains a purple accent',()=>{
 const {base,accent}=equalizerColors([9,10,13],'#171820',true)
 assert.equal(base,'rgb(255,255,255)');assert.equal(accent,'rgb(179,154,245)')
})

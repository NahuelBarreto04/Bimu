import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
test('avatar follows the home card after results insertion and scrolling, and hides outside the panel',()=>{
 const values={},dataset={edge:'top'},handlers={};let cleanup,resize
 const bounds={surface:{left:100,top:20},body:{top:77,bottom:340},card:{left:114,top:94,bottom:259}}
 const card={getBoundingClientRect:()=>bounds.card},body={getBoundingClientRect:()=>bounds.body,querySelector:s=>s==='.companion-card'?card:null,addEventListener:(event,fn)=>handlers[event]=fn,removeEventListener:event=>delete handlers[event]},surface={getBoundingClientRect:()=>bounds.surface,querySelector:()=>body}
 const context=vm.createContext({document:{documentElement:{dataset,style:{setProperty:(k,v)=>values[k]=v}},querySelector:()=>surface},window:{addEventListener(){},removeEventListener(){}},useLayoutEffect:fn=>cleanup=fn(),ResizeObserver:class{constructor(fn){resize=fn}observe(){}disconnect(){}}})
 vm.runInContext(readFileSync(new URL('../src/useHomeAvatar.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace('export function','function')+';useHomeAvatar(true)',context)
 assert.equal(values['--home-avatar-top'],'90px');assert.equal(values['--home-avatar-left'],'24px')
 bounds.card={left:114,top:394,bottom:559};resize();assert.equal(values['--home-avatar-top'],'390px');assert.equal(dataset.homeAvatarVisible,'false')
 bounds.card={left:114,top:170,bottom:335};handlers.scroll();assert.equal(values['--home-avatar-top'],'166px');assert.equal(dataset.homeAvatarVisible,'true')
 bounds.card={left:114,top:30,bottom:195};handlers.scroll();assert.equal(values['--home-avatar-clip-top'],'31px')
 cleanup();assert.equal(dataset.homeAvatarVisible,undefined);assert.equal(handlers.scroll,undefined)
})

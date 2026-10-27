import React,{useEffect,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import './styles.css'
import {useIdleRest} from './useIdleRest'
import {DesktopControls} from './desktop.jsx'
function App(){
 const [config,setConfig]=useState(()=>{try{return {...{size:'M'},...JSON.parse(localStorage.getItem('mascot-v1')||'{}')}}catch{return {size:'M'}}})
 const [expanded,setExpanded]=useState(false),[mood,setMood]=useState('idle')
 const reception=useRef({active:false,catching:false,target:[0,0]})
 const interact=useIdleRest({enabled:true,busy:false,onRest:()=>setMood('sleepy'),onWake:()=>setMood('idle')})
 useEffect(()=>{try{localStorage.setItem('mascot-v1',JSON.stringify(config))}catch{}},[config])
 return <main className={'app desktop '+(expanded?'expanded':'compact')}><DesktopControls config={config} onConfig={setConfig} expanded={expanded} onExpand={setExpanded} mood={mood} reception={reception} onInteract={interact}/></main>
}
createRoot(document.getElementById('root')).render(<App/> )

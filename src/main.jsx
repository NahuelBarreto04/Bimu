import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import { RoundedBox, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { RotateCcw, Sparkles } from 'lucide-react'
import './styles.css'
import {gazeTarget} from './dock-geometry'
import { DesktopControls, desktopMode } from './desktop.jsx'

const DEFAULT = { color: '#F6CDB5', accessory: 'none', face: 'default', size: 'M' }
const COLORS = ['#F6CDB5', '#F7E6D5', '#F4D3C8', '#F5D995', '#B8DBCB', '#B8D6EE', '#CDBBE9', '#A9AFB8']
const OPTIONS = [{ id:'none', name:'Sin accesorio', symbol:'✕' },{ id:'crown',name:'Corona',symbol:'♛' },{ id:'hat',name:'Sombrero',symbol:'🎩' },{ id:'sprout',name:'Brote',symbol:'🌱' },{ id:'bow',name:'Moño',symbol:'🎀' },{ id:'mustache',name:'Bigote',symbol:'〰' },{ id:'lashes',name:'Pestañas',symbol:'✧' },{ id:'glasses',name:'Anteojos',symbol:'◉' }]

function Sphere({ position, scale, color, roughness = 0.72, ...props }) {
  return <mesh position={position} scale={scale} {...props}><sphereGeometry args={[1,32,24]}/><meshStandardMaterial color={color} roughness={roughness}/></mesh>
}

function Accessory({ type }) {
  if (type === 'crown') return <group position={[0,0.94,0]}>
    <mesh><cylinderGeometry args={[0.36,0.39,0.13,48,1,true]}/><meshStandardMaterial color="#EAC16D" metalness={0.45} roughness={0.3} side={THREE.DoubleSide}/></mesh>
    {Array.from({length:5},(_,i)=>{const a=i*Math.PI*2/5;return <group key={i} position={[Math.sin(a)*0.35,0.13,Math.cos(a)*0.35]}><mesh><coneGeometry args={[0.12,0.25,4]}/><meshStandardMaterial color="#EAC16D" metalness={0.45} roughness={0.3}/></mesh><Sphere position={[0,0.14,0]} scale={[0.038,0.038,0.038]} color="#FFF1B6"/></group>})}
  </group>
  if (type === 'hat') return <group position={[0,0.94,0]}><mesh><cylinderGeometry args={[0.48,0.48,0.09,32]}/><meshStandardMaterial color="#454A51"/></mesh><mesh position={[0,0.28,0]}><cylinderGeometry args={[0.34,0.39,0.55,32]}/><meshStandardMaterial color="#454A51"/></mesh><mesh position={[0,0.1,0]}><cylinderGeometry args={[0.39,0.39,0.09,32]}/><meshStandardMaterial color="#B78B79"/></mesh></group>
  if (type === 'sprout') return <group position={[0,0.88,0]}><mesh position={[0,0.16,0]}><cylinderGeometry args={[0.026,0.035,0.38,10]}/><meshStandardMaterial color="#71936C"/></mesh><Sphere position={[-0.17,0.36,0]} scale={[0.25,0.09,0.13]} color="#95BD80" rotation={[0,0,0.48]}/><Sphere position={[0.16,0.38,0]} scale={[0.24,0.09,0.13]} color="#7DA96D" rotation={[0,0,-0.48]}/></group>
  if (type === 'bow') return <group position={[0.57,0.72,0.48]} rotation={[0,0,-0.22]}><Sphere position={[-0.14,0,0]} scale={[0.2,0.13,0.08]} color="#E9A0A7"/><Sphere position={[0.14,0,0]} scale={[0.2,0.13,0.08]} color="#E9A0A7"/><Sphere position={[0,0,0.06]} scale={[0.09,0.09,0.09]} color="#D77E8A"/></group>
  if (type === 'mustache') return <group position={[0,0.025,0.79]}><Sphere position={[-0.14,0,0]} scale={[0.17,0.07,0.035]} color="#65473F" rotation={[0,0,-0.2]}/><Sphere position={[0.14,0,0]} scale={[0.17,0.07,0.035]} color="#65473F" rotation={[0,0,0.2]}/></group>
  if (type === 'lashes') return <group>{[-0.32,0.32].map((x)=><group key={x} position={[x,0.22,0.79]}>{[-0.08,0.08].map((dx)=><mesh key={dx} position={[dx,0.105,0]} rotation={[0,0,dx>0?-0.35:0.35]}><cylinderGeometry args={[0.012,0.012,0.12,8]}/><meshStandardMaterial color="#302B2B"/></mesh>)}</group>)}</group>
  if (type === 'glasses') return <group position={[0,0.22,0.82]}>{[-0.32,0.32].map(x=><mesh key={x} position={[x,0,0]}><torusGeometry args={[0.155,0.018,8,32]}/><meshStandardMaterial color="#544943" metalness={0.3}/></mesh>)}<mesh position={[0,0.04,0]}><boxGeometry args={[0.34,0.025,0.025]}/><meshStandardMaterial color="#544943"/></mesh></group>
  return null
}

// Shoulder and wrist pivots keep the hand attached throughout the greeting.
function Arm({ side, color, waving, reception }) {
  const shoulder=useRef(); const wrist=useRef()
  useFrame(({clock},delta)=>{
    const t=clock.elapsedTime
    const receiving=reception?.current.active
    const target=receiving ? side*(reception.current.catching?1.65:2.05) : waving && side===1 ? 2.45+Math.sin(t*9)*0.24 : side*0.12+Math.sin(t*1.9)*0.055
    shoulder.current.rotation.z=THREE.MathUtils.damp(shoulder.current.rotation.z,target,8,delta)
    shoulder.current.rotation.x=THREE.MathUtils.damp(shoulder.current.rotation.x,receiving?-0.55:0,8,Math.min(delta,0.05))
    wrist.current.rotation.z=THREE.MathUtils.damp(wrist.current.rotation.z,waving&&side===1?Math.sin(t*12)*0.35:0,10,delta)
  })
  return <group position={[side*0.91,-0.1,0.03]}><group ref={shoulder}>
    <Sphere position={[0,-0.17,0]} scale={[0.105,0.25,0.11]} color={color}/>
    <group ref={wrist} position={[0,-0.38,0]}><Sphere scale={[0.145,0.155,0.105]} color={color}/></group>
  </group></group>
}

function SleepLetters({ active }) {
  const letters=useRef([])
  const shape=useMemo(()=>{
    const z=new THREE.Shape()
    ;[[-0.12,0.15],[0.12,0.15],[0.12,0.09],[-0.035,-0.09],[0.12,-0.09],[0.12,-0.15],[-0.12,-0.15],[-0.12,-0.09],[0.035,0.09],[-0.12,0.09]].forEach(([x,y],i)=>i?z.lineTo(x,y):z.moveTo(x,y))
    z.closePath();return z
  },[])
  const elapsed=useRef(0)
  useFrame((_,delta)=>{
    if(!active){elapsed.current=0;return}
    elapsed.current+=delta
    letters.current.forEach((mesh,i)=>{
      if(!mesh)return
      const age=elapsed.current-i*0.85
      mesh.visible=age>=0
      const phase=((age%2.55)+2.55)%2.55/2.55
      mesh.position.set(0.63+phase*0.48+Math.sin(phase*5)*0.07,0.9+phase*0.92,0.25+phase*0.3)
      mesh.scale.setScalar(0.3+phase*0.95)
      mesh.rotation.set(0.08,Math.sin(phase*4)*0.32,-0.12+phase*0.23)
      mesh.material.opacity=Math.min(1,phase/0.16,(1-phase)/0.25)*0.9
    })
  })
  return <group visible={active}>{[0,1,2].map(i=><mesh key={i} ref={el=>letters.current[i]=el} visible={false}>
    <extrudeGeometry args={[shape,{depth:0.055,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:0.012,bevelThickness:0.012}]}/>
    <meshStandardMaterial color="#8B9EB9" transparent opacity={0} depthWrite={false} roughness={0.4} metalness={0.15}/>
  </mesh>)}</group>
}

function Mascot({ config, mood, celebrate, onTap, thinking, reception }) {
  const group = useRef(); const body = useRef(); const eyes = useRef([]); const pointer = useRef([0,0]); const blink = useRef(1)
  useEffect(()=>{const move=(e)=>{const rect=document.querySelector('.canvas-wrap')?.getBoundingClientRect();if(rect)pointer.current=gazeTarget(e.clientX,e.clientY,rect)};window.addEventListener('pointermove',move);return()=>window.removeEventListener('pointermove',move)},[])
  useFrame(({clock},delta)=>{
    const t=clock.elapsedTime
    if(reception?.current.active)pointer.current=reception.current.target
    if(group.current){group.current.position.y=0.025*Math.sin(t*1.9)+(celebrate?Math.abs(Math.sin(t*7))*0.19:0);group.current.rotation.y=THREE.MathUtils.lerp(group.current.rotation.y,(thinking?Math.sin(t*1.5)*0.06:pointer.current[0]*0.14),delta*2);group.current.rotation.x=THREE.MathUtils.lerp(group.current.rotation.x,-pointer.current[1]*0.08,delta*2)}
    if(body.current){body.current.scale.y=1+0.014*Math.sin(t*2);body.current.scale.x=1-0.009*Math.sin(t*2)}
    const phase=t%4.3; const target=mood==='sleepy'?0.12:phase>3.83&&phase<3.97?0.1:1
    blink.current=THREE.MathUtils.lerp(blink.current,target,Math.min(1,delta*25))
    eyes.current.forEach((eye)=>{if(eye){eye.scale.y=eye.userData.baseScaleY*blink.current;eye.position.x=THREE.MathUtils.damp(eye.position.x,eye.userData.baseX+pointer.current[0]*0.018,8,delta);eye.position.y=THREE.MathUtils.damp(eye.position.y,0.22-(mood==='sleepy'?0:pointer.current[1]*0.018),8,delta)}})
  })
  const sleepy=mood==='sleepy'
  return <group ref={group} onClick={onTap}>
    <group ref={body}>
      <RoundedBox args={[2.03,1.82,1.48]} radius={0.65} smoothness={12} position={[0,0.05,0]} scale={[1,1,1]}><meshStandardMaterial color={config.color} roughness={0.86} metalness={0}/></RoundedBox>
      {[-0.32,0.32].map((x,i)=><group key={i}>
        <Sphere position={[x*1.55,-0.05,0.765]} scale={[0.13,0.065,0.023]} color="#EEA7A2"/>
        <mesh ref={el=>{eyes.current[i]=el;if(el){el.userData.baseX=x;el.userData.baseScaleY=0.092}}} position={[x,0.22,0.765]} scale={[0.075,0.092,0.045]}><sphereGeometry args={[1,24,20]}/><meshStandardMaterial color="#2C2526" roughness={0.16}/></mesh>
      </group>)}
      <mesh position={[0,-0.08,0.78]} rotation={[0,0,Math.PI]}><torusGeometry args={[0.083,0.016,8,28,Math.PI]}/><meshStandardMaterial color="#8C514A"/></mesh>
      <Accessory type={config.accessory}/>
    </group>
    {[-1,1].map(side=><Arm key={side} side={side} color={config.color} waving={celebrate&&!sleepy} reception={reception}/>)}
    <SleepLetters active={sleepy}/>
  </group>
}

function App(){
  const [config,setConfig]=useState(()=>{try{return {...DEFAULT,...JSON.parse(localStorage.getItem('mascot-v1')||'{}')}}catch{return DEFAULT}})
  const reception=useRef({active:false,catching:false,target:[0,0]})
  const [thinking,setThinking]=useState(false)
  const [desktopExpanded,setDesktopExpanded]=useState(new URLSearchParams(location.search).get('desktop')==='1')
  const [mood,setMood]=useState('idle'); const [celebrate,setCelebrate]=useState(false); const greetingTimer=useRef()
  useEffect(()=>()=>clearTimeout(greetingTimer.current),[])
  useEffect(()=>{localStorage.setItem('mascot-v1',JSON.stringify(config))},[config])
  const tap=()=>{clearTimeout(greetingTimer.current);setMood('idle');setCelebrate(true);greetingTimer.current=window.setTimeout(()=>setCelebrate(false),2800)}
  const personalization=(<aside className="panel"><div className="panel-title"><div><span className="eyebrow">PERSONALIZACIÓN</span><h2>Hacela tuya</h2></div><Sparkles size={20}/></div><p>Sin género ni apariencia predefinida. Elegí lo que más te guste.</p><h3>Color del cuerpo</h3><div className="swatches">{COLORS.map(color=><button key={color} aria-label={'Color '+color} title={color} className={'swatch '+(config.color===color?'selected':'')} style={{background:color}} onClick={()=>setConfig(c=>({...c,color}))}/>)}</div><h3>Accesorios</h3><div className="accessories">{OPTIONS.map(a=><button key={a.id} className={'accessory '+(config.accessory===a.id?'selected':'')} onClick={()=>setConfig(c=>({...c,accessory:a.id}))}><span>{a.symbol}</span><small>{a.name}</small></button>)}</div><div className="panel-footer"><button className="reset" onClick={()=>{setConfig(DEFAULT);setMood('idle')}}><RotateCcw size={15}/> Restablecer</button><span>Guardado automático</span></div></aside>)
  return <main className={desktopMode ? "app desktop "+(desktopExpanded?"expanded":"compact") : "app"}>
    {desktopMode&&<DesktopControls reception={reception} expanded={desktopExpanded} onExpand={setDesktopExpanded} personalization={personalization} mood={mood} onThinking={setThinking} config={config} onConfig={setConfig} onRest={()=>{setCelebrate(false);setMood('sleepy')}} onGreet={tap}/>}
    <header><div className="brand"><span className="brand-dot"/> <span>Mi pequeño compañero</span></div><span className="version">PROTOTIPO · 0.16</span></header>
    <section className="workspace"><div className="stage"><div className="eyebrow">TU COMPAÑERO DE ESCRITORIO</div><h1>Un poquito de compañía.</h1><p>Una criatura pequeña, expresiva y completamente tuya.</p><div className="canvas-wrap"><div className="mascot-viewport"><Canvas resize={{offsetSize:true}} gl={{alpha:true}} shadows camera={{position:[0,0.45,6.6],fov:35}} dpr={[1,2]}><ambientLight intensity={2.1}/><directionalLight position={[-3,5,6]} intensity={2.4} color="#fff6eb"/><directionalLight position={[4,2,-2]} intensity={0.8} color="#ffffff"/><Mascot reception={reception} thinking={thinking} config={config} mood={mood} celebrate={celebrate} onTap={desktopMode?()=>{setDesktopExpanded(true);tap()}:tap}/><ContactShadows position={[0,-1.04,0]} opacity={0.26} scale={5} blur={2.6} far={3}/></Canvas></div></div><div className="hint">Mové el cursor, esperá un parpadeo o hacé clic sobre la mascota ✨</div><div className="moods"><button onClick={()=>setMood('idle')} className={mood==='idle'?'active':''}>☺ Normal</button><button onClick={tap}>✦ Saludar</button><button onClick={()=>{clearTimeout(greetingTimer.current);setCelebrate(false);setMood('sleepy')}} className={mood==='sleepy'?'active':''}>☾ Descansar</button></div></div>
    {!desktopMode&&personalization}</section><footer>Prototipo visual · La conexión con Ollama llegará en la próxima etapa.</footer>
  </main>
}
createRoot(document.getElementById('root')).render(<App/>)

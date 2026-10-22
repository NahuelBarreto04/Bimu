import React, { useEffect, useRef, useState } from 'react'
import { isTauri, invoke } from '@tauri-apps/api/core'
import { getCurrentWindow, LogicalSize, PhysicalPosition, currentMonitor } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import { Home, MessageCircle, PanelsTopLeft, Settings2, Grip, ArrowDownLeft, ArrowUpRight, Minus, Sun, Moon, Monitor, Hand, Sparkles, Plug, Github, Globe, Cpu, ArrowRight, Send, Check, Palette, Pin, Crosshair, Power, X, FolderOpen, LoaderCircle } from 'lucide-react'
import './desktop.css'
import {useDock} from './useDock'
import {useOllama} from './useOllama'
import {useDropZone} from './useDropZone'
import {MessageContent} from './MessageContent'
import {ConversationHistory,MemoryPanel} from './ConversationPanels'
import {useVoice} from './useVoice'
import {VoiceControls,VoiceStatus,VoiceSettings} from './VoicePanels'
import {useApplications} from './useApplications'
import {ApplicationConfirmation,ApplicationSettings} from './ApplicationPanels'
import {useWakeListener} from './useWakeListener'
import {WakeIndicator,WakeSettings} from './WakePanels'

export const nativeMode=isTauri()
export const desktopMode=nativeMode||new URLSearchParams(location.search).get('desktop')==='1'
if(desktopMode)document.documentElement.classList.add('desktop-root')
if(desktopMode&&!nativeMode)document.documentElement.classList.add('desktop-preview')
const sizes={S:[80,85],M:[100,105],L:[125,130]}
const TINTS=[['iris','Lavanda','#ac9bf2'],['ocean','Océano','#80bce5'],['sage','Salvia','#94c5b1'],['peach','Durazno','#e3ae95']]
const SERVICES=[{id:'ollama',name:'Ollama',desc:'Tu inteligencia, en tu equipo.',icon:Cpu,color:'#a6cfbf'}, {id:'github',name:'GitHub',desc:'Repositorios y actividad.',icon:Github,color:'#bba9e8'}, {id:'vercel',name:'Vercel',desc:'Tus proyectos y despliegues.',icon:Globe,color:'#97bbdf'}, {id:'n8n',name:'n8n',desc:'Automatizaciones a tu manera.',icon:PanelsTopLeft,color:'#e7b58e'}]
const saved=(key,fallback)=>{try{return localStorage.getItem(key)||fallback}catch{return fallback}}
function IconButton({title,children,...props}){return <button type="button" className="icon-button" title={title} aria-label={title} {...props}>{children}</button>}

export function DesktopControls({config,onConfig,onRest,onGreet,expanded,onExpand,personalization,mood,onThinking,reception}) {
  const [tab,setTab]=useState('home')
  const ai=useOllama(nativeMode)
  const localReception=useRef({active:false,catching:false,target:[0,0]})
  const receiveRef=reception||localReception
  const chatEnd=useRef()
  useEffect(()=>{onThinking?.(ai.sending)},[ai.sending,onThinking])
  useEffect(()=>{chatEnd.current?.scrollIntoView?.({block:'end',behavior:ai.sending?'auto':'smooth'})},[ai.messages,ai.sending,tab])
  const [theme,setTheme]=useState(()=>saved('companion-theme','dark'))
  const [tint,setTint]=useState(()=>saved('companion-tint','iris'))
  const [pinned,setPinned]=useState(()=>saved('mascot-pinned','true')!=='false')
  const [systemDark,setSystemDark]=useState(()=>matchMedia('(prefers-color-scheme: dark)').matches)
  const [draft,setDraft]=useState(()=>saved('companion-draft',''))
  const apps=useApplications({native:nativeMode,onResult:ai.recordAction})
  const voice=useVoice({native:nativeMode,enabled:expanded&&tab==='chat',busy:ai.sending||ai.choosing||apps.busy||!!apps.pending,onTranscript:text=>{const merged=draft.trim()?draft+'\n'+text:text;if(merged.length>16000)throw Error('El borrador no tiene espacio suficiente. Acortalo antes de volver a grabar.');setDraft(merged)}})
  const wake=useWakeListener({native:nativeMode,device:voice.device,busy:ai.sending||ai.choosing||apps.busy||!!apps.pending||voice.active||voice.detecting,onRequest:async text=>{
    if(apps.isCommand(text)){const handled=await apps.request(text);if(handled==='error'){setTab('chat');onExpand(true)}return}
    const merged=draft.trim()?draft+'\n'+text:text;if(merged.length>16000)throw Error('El borrador no tiene espacio. Acortalo antes de pedir otro dictado.');setDraft(merged);setTab('chat');onExpand(true)
  }})
  useEffect(()=>{if(apps.pending){setTab('chat');onExpand(true)}},[apps.pending,onExpand])
  const drop=useDropZone({native:nativeMode,busy:ai.sending||ai.choosing||voice.active||voice.detecting||apps.busy||!!apps.pending,reception:receiveRef})
  const [service,setService]=useState(null)
  const [hovered,setHovered]=useState(false)
  const hoverTimer=useRef()
  const [error,setError]=useState('')
  const callbacks=useRef({onRest,onGreet});callbacks.current={onRest,onGreet}
  const safe=async(fn)=>{try{if(nativeMode)await fn();setError('')}catch(e){setError('No se pudo completar la acción: '+String(e))}}
  const resolvedTheme=theme==='system'?(systemDark?'dark':'light'):theme
  useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)');const update=()=>setSystemDark(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[])
  useEffect(()=>{
    document.documentElement.dataset.theme=resolvedTheme
    document.documentElement.dataset.tint=tint
    localStorage.setItem('companion-theme',theme);localStorage.setItem('companion-tint',tint)
  },[theme,tint,resolvedTheme])
  useEffect(()=>{safe(()=>getCurrentWindow().setAlwaysOnTop(pinned));localStorage.setItem('mascot-pinned',String(pinned))},[pinned])
  useEffect(()=>{localStorage.setItem('companion-draft',draft)},[draft])
  useEffect(()=>{document.documentElement.dataset.view=tab},[tab])
  useEffect(()=>{document.documentElement.dataset.receiveLayout=expanded?'panel':'notch'},[expanded])
  const dock=useDock({native:nativeMode,expanded,hovered:hovered||drop.active,tab,size:config.size,onError:setError})
  const dockCallbacks=useRef(dock);dockCallbacks.current=dock
  // Observe the whole companion surface, including its avatar and quick input.
  // Crossing between descendants must never be treated as leaving the notch.
  useEffect(()=>{
    const surface=document.querySelector('.desktop')||document.body
    const enter=()=>{clearTimeout(hoverTimer.current);if(!expanded)setHovered(true)}
    const leave=e=>{
      if(e.relatedTarget&&surface.contains(e.relatedTarget))return
      clearTimeout(hoverTimer.current);hoverTimer.current=setTimeout(()=>{if(!surface.contains(document.activeElement))setHovered(false)},340)
    }
    surface.addEventListener('pointerenter',enter);surface.addEventListener('pointerleave',leave)
    surface.addEventListener('focusin',enter);surface.addEventListener('focusout',leave)
    return()=>{clearTimeout(hoverTimer.current);surface.removeEventListener('pointerenter',enter);surface.removeEventListener('pointerleave',leave);surface.removeEventListener('focusin',enter);surface.removeEventListener('focusout',leave)}
  },[expanded])
  useEffect(()=>{if(expanded)setHovered(false)},[expanded])
  useEffect(()=>{
    if(!expanded||tab!=='home'||drop.active)return
    let timer;const restart=()=>{clearTimeout(timer);timer=setTimeout(()=>onExpand(false),20000)}
    restart();window.addEventListener('pointermove',restart);window.addEventListener('pointerdown',restart);window.addEventListener('keydown',restart)
    return()=>{clearTimeout(timer);window.removeEventListener('pointermove',restart);window.removeEventListener('pointerdown',restart);window.removeEventListener('keydown',restart)}
  },[expanded,tab,onExpand,drop.active])
  useEffect(()=>{
    if(!nativeMode)return
    let disposed=false;let off
    listen('desktop-action',({payload})=>{
      if(payload==='center'){dockCallbacks.current.center();dockCallbacks.current.reanchor()}
      if(payload==='show')dockCallbacks.current.reanchor()
      if(payload==='settings'){onExpand(true);setTab('settings')}
      if(payload==='rest')callbacks.current.onRest()
      if(payload==='greet')callbacks.current.onGreet()
    }).then(fn=>{if(disposed)fn();else off=fn}).catch(e=>setError(String(e)))
    return()=>{disposed=true;off?.()}
  },[onExpand])
  const collapse=()=>{setHovered(false);onExpand(false);setTab('home')}
  const openNotch=()=>{if(!dock.consumeDrag()){clearTimeout(hoverTimer.current);setTab('home');onExpand(true)}}
  const submitMessage=async()=>{if(voice.active||ai.sending||ai.choosing||apps.busy||apps.pending)return;const text=draft;const handled=await apps.request(text);if(handled){if(handled!=='error')setDraft(current=>current===text?'':current);return}if(await ai.send(text))setDraft(current=>current===text?'':current)}
  const openQuickChat=e=>{e.preventDefault();clearTimeout(hoverTimer.current);setTab('chat');onExpand(true);if(ai.connected&&ai.model)submitMessage()}
  const chooseTab=id=>{setTab(id);setService(null)}
  return <>
    <WakeIndicator wake={wake}/>
    {drop.active&&<section className="drop-surface" aria-label="Recibir archivos o carpeta"><div className="drop-outline"/>{drop.stage==='hover'&&<><FolderOpen className="drop-folder-icon" size={23}/><p className="drop-invitation">Soltá los archivos. Yo los recibo.</p></>}{drop.stage==='preparing'&&<p className="drop-preparing" role="status"><LoaderCircle size={14}/> Preparando el contenido…</p>}{drop.stage==='ready'&&<div className="drop-ready"><strong title={drop.preview.name}>{drop.preview.name}</strong><small>{drop.preview.kind==='files'?`${drop.preview.ready}/${drop.preview.entries} archivos listos`:`${drop.preview.truncated?'Más de ':''}${drop.preview.entries} elementos visibles`} · solo lectura</small>{drop.preview.kind==='files'&&<details className="drop-file-list" onToggle={e=>{if(e.currentTarget.open&&!expanded)onExpand(true)}}><summary>Ver archivos</summary>{drop.preview.items.map((item,i)=><p key={i}>{item.name}: {item.detail}</p>)}</details>}<p>¿Qué querés hacer?</p><div><button disabled={drop.accepting||(drop.preview.kind==='files'&&!drop.preview.ready)} onClick={async()=>{if(await drop.accept(ai.acceptDroppedFolder)){setHovered(false);setTab('chat');onExpand(true)}}}>{drop.accepting?'Recibiendo…':'Usar en el chat'}</button><button disabled={drop.accepting} onClick={drop.reset}>Cancelar</button></div></div>}{drop.stage==='error'&&<div className="drop-error" role="alert"><p>{drop.error}</p><button onClick={drop.reset}>Entendido</button></div>}</section>}
    {!expanded&&!drop.active&&<button className="notch-surface" aria-label="Abrir compañero" {...dock.handlers} onClick={openNotch}>
      <span className="notch-avatar-slot" aria-hidden="true"/>
      <span className="notch-copy"><strong>Tu compañero</strong><small>{mood==='sleepy'?'Descansando':'Acá, con vos'}</small></span>
      <span className="notch-indicator"><span className="status-dot"/></span>
      <span className="notch-grip"><Grip size={12}/></span>
    </button>}
    {!expanded&&!drop.active&&<form className="quick-chat" aria-label="Chat rápido" onSubmit={openQuickChat}>
      <label htmlFor="quick-message">Hablá con Bimu</label>
      <div><input id="quick-message" aria-label="Mensaje rápido para Bimu" value={draft} onChange={e=>setDraft(e.target.value)} placeholder={ai.sending?"Bimu está pensando…":"Escribile a Bimu…"} maxLength={16000} autoComplete="off"/><IconButton title="Abrir mensaje en el chat" type="submit" disabled={ai.sending}><Send size={14}/></IconButton></div>
    </form>}
    {expanded&&<section className="glass-shell" inert={drop.active?true:undefined} aria-label="Panel del compañero">
      <header className="hub-header">
        <nav className="hub-tabs" aria-label="Navegación principal">{[[Home,'home','Inicio'],[MessageCircle,'chat','Chat'],[Plug,'connections','Conexiones'],[Settings2,'settings','Ajustes']].map(([Icon,id,label])=><button key={id} title={label} aria-label={label} aria-current={tab===id?'page':undefined} className={tab===id?'selected':''} onClick={()=>chooseTab(id)}><Icon size={16}/><span>{label}</span></button>)}</nav>
        <div className="window-actions"><IconButton title={dock.lateral?"Mover sobre el borde vertical":"Mover sobre el borde horizontal"} {...dock.handlers}><Grip size={16}/></IconButton><IconButton title={resolvedTheme==='dark'?'Cambiar a claro':'Cambiar a oscuro'} onClick={()=>setTheme(resolvedTheme==='dark'?'light':'dark')}>{resolvedTheme==='dark'?<Sun size={16}/>:<Moon size={16}/>}</IconButton><IconButton title="Volver a pequeño" onClick={collapse}><ArrowDownLeft size={16}/></IconButton><IconButton title="Ocultar en la bandeja" onClick={()=>{voice.cancel();wake.stop();safe(()=>getCurrentWindow().hide())}}><Minus size={16}/></IconButton></div>
      </header>
      <div className={'hub-body view-'+tab}>
        {tab==='home'&&<>
          <div className="home-grid"><section className="companion-card glass-card"><div className="companion-copy"><span className="micro-label"><i className="status-dot"/> TU COMPAÑERO</span><h1>{ai.sending?'Estoy pensando…':mood==='sleepy'?'Un momento de calma.':'Acá, con vos.'}</h1><p>{mood==='sleepy'?'Descansando un poquito.':'Un pequeño espacio para tus grandes ideas.'}</p><div className="gesture-buttons"><button onClick={onGreet}><Hand size={14}/> Saludar</button><button onClick={onRest}><Moon size={14}/> Descansar</button></div></div></section>
          <section className="services-card glass-card"><div className="section-line"><span className="micro-label">TU ESPACIO</span><button className="text-link" onClick={()=>chooseTab('connections')}>Configurar <ArrowUpRight size={12}/></button></div><div className="service-pills">{SERVICES.map(({id,name,icon:Icon,color})=><button key={id} onClick={()=>{chooseTab('connections');setService(id)}}><span style={{color}}><Icon size={15}/></span>{name}<span className="empty-dot"/></button>)}</div></section></div>
          <button className="chat-shortcut glass-card" onClick={()=>chooseTab('chat')}><span className="chat-shortcut-icon"><MessageCircle size={18}/></span><span><strong>¿En qué estamos pensando hoy?</strong><small>Tu próxima conversación empieza acá.</small></span><ArrowRight size={17}/></button>
        </>}
        {tab==='chat'&&<section className="chat-view">
          <div className="section-line chat-model-bar"><span className="micro-label">CONVERSACIONES</span><div><select aria-label="Modelo de chat" value={ai.model} disabled={ai.sending||!ai.models.length} onChange={e=>ai.setModel(e.target.value)}><option value="" disabled>Elegí un modelo</option>{ai.models.map(m=><option key={m} value={m}>{m}</option>)}</select><button className="text-link" disabled={ai.sending||ai.choosing||voice.active||apps.busy||!!apps.pending} onClick={ai.newConversation}>Nueva conversación</button></div></div>
          <ConversationHistory ai={{...ai,choosing:ai.choosing||voice.active||apps.busy||!!apps.pending}}/>{ai.storageError&&<p className="ollama-error" role="alert">{ai.storageError}</p>}<section className="workspace-bar" aria-label="Carpeta compartida"><div><FolderOpen size={15}/><span>{ai.folder?ai.folder.name:'Sin contenido compartido'}</span>{ai.folder&&<small>Solo lectura</small>}</div><div><button type="button" disabled={ai.sending||ai.choosing||voice.active||apps.busy||!!apps.pending} onClick={ai.chooseFolder}>{ai.choosing?'Abriendo…':ai.folder?.kind==='files'?'Usar carpeta':ai.folder?'Cambiar':'Compartir carpeta'}</button><button type="button" disabled={ai.sending||ai.choosing||voice.active||apps.busy||!!apps.pending} onClick={ai.chooseFiles}>Agregar archivos</button>{ai.folder&&<button type="button" disabled={ai.sending||ai.choosing||voice.active||apps.busy||!!apps.pending} onClick={ai.revokeFolder}>Quitar</button>}</div></section>
          {ai.folder?.kind==='files'&&<details className="shared-documents"><summary>{ai.folder.count} archivos compartidos</summary>{ai.folder.items.map(item=><div key={item.id}><span>{item.name}{item.truncated?' · extracto parcial':''}</span><button disabled={ai.sending||ai.choosing||voice.active||apps.busy||!!apps.pending} aria-label={'Quitar '+item.name} onClick={()=>ai.removeFile(item.id)}>Quitar</button></div>)}</details>}{!!ai.folder?.issues?.length&&<details className="shared-documents"><summary>No se pudieron agregar {ai.folder.issues.length} archivos</summary>{ai.folder.issues.map((item,i)=><p key={i}>{item.name}: {item.detail}</p>)}</details>}{ai.folder&&<p className="workspace-hint">{ai.folder.kind==='files'?'Los adjuntos preparados se envían como contexto al modelo. Podés compararlos por sus nombres.':'Los archivos consultados se envían al modelo elegido.'} {ai.folder.kind==='files'?'':ai.toolsSupport===null?'Comprobando herramientas…':ai.toolsSupport?'Podés preguntar por este proyecto.':'Este modelo no admite herramientas o no se pudo comprobar.'}</p>}
          {!!ai.activity.length&&<details className="tool-activity" open={ai.sending}><summary>Consultas de archivos · {ai.activity.length}</summary><ul>{ai.activity.map((tool,i)=><li key={i}><span>{tool.name==='read_file'?'Leer':'Listar'} {tool.path}</span><small>{({running:'En curso',done:'Completado',error:'No disponible',stopped:'Detenido'})[tool.status]}</small></li>)}</ul></details>}
          {ai.messages.length?<div className="chat-history" aria-live="polite">{ai.messages.map((m,i)=><article key={i} className={'chat-message '+m.role}><span>{m.role==='user'?'Vos':'Bimu'}</span><MessageContent content={m.content} markdown={m.role==='assistant'}/>{m.interrupted&&<small className="chat-notice">Respuesta interrumpida</small>}</article>)}{ai.sending&&<div className="thinking" role="status"><Sparkles size={14}/> Bimu está pensando…</div>}<div ref={chatEnd}/></div>:<div className="chat-empty"><span className="large-orb"><Sparkles size={26}/></span><h1>Un lugar para tus ideas.</h1><p>{ai.connected&&ai.model?'Tu modelo está listo. ¿Qué hacemos hoy?':'Conectá Ollama y elegí uno de tus modelos para empezar.'}</p>{(!ai.connected||!ai.model)&&<button className="primary-button" onClick={()=>{chooseTab('connections');setService('ollama')}}><Cpu size={15}/> Configurar Ollama <ArrowRight size={14}/></button>}</div>}
          {ai.error&&<p className="ollama-error" role="alert">{ai.error}</p>}{ai.notice&&<p className="chat-notice" role="status">{ai.notice}</p>}
          <ApplicationConfirmation apps={apps}/><VoiceStatus voice={voice}/><form className="composer glass-card" onSubmit={e=>{e.preventDefault();submitMessage()}}><textarea disabled={voice.active} aria-label="Borrador de mensaje" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submitMessage()}}} maxLength={16000} placeholder="Escribile a Bimu…" rows={2}/><div><small>{ai.sending?'Generando respuesta…':ai.connected&&ai.model?'Enter para enviar · Shift+Enter para otra línea':'Conectá Ollama para enviar'}</small><div className="send-controls"><VoiceControls voice={voice} busy={ai.sending||ai.choosing||apps.busy||!!apps.pending||wake.enabled}/>{ai.sending?<button type="button" className="stop-generation" disabled={ai.stopping} onClick={ai.stop}>{ai.stopping?'Deteniendo…':'Detener'}</button>:<IconButton title="Enviar mensaje" type="submit" disabled={voice.active||ai.choosing||apps.busy||!!apps.pending||(!apps.isCommand(draft)&&(!ai.connected||!ai.model))||!draft.trim()}><Send size={16}/></IconButton>}</div></div></form>
        </section>}
        {tab==='connections'&&<section><div className="page-heading"><span className="micro-label">TODO EN SU LUGAR</span><h1>Conectá tu mundo.</h1><p>Un espacio para tu IA y las herramientas que usás.</p></div><div className="connection-grid">{SERVICES.map(({id,name,desc,icon:Icon,color})=><button key={id} className={'connection-tile glass-card '+(service===id?'chosen':'')} onClick={()=>setService(id)} aria-pressed={service===id}><span className="service-icon" style={{color}}><Icon size={23}/></span><span><strong>{name}</strong><small>{desc}</small></span><span className="state-badge">{id==='ollama'&&ai.connected?'Conectado':'Pendiente'}</span></button>)}</div><OllamaPanel ai={ai}/><div className="connection-note glass-card"><Plug size={18}/><div><strong>{service==='ollama'?'Tu IA en tu equipo':service?SERVICES.find(s=>s.id===service)?.name+': conexión pendiente':'Conectá tu modelo local'}</strong><p>{service==='ollama'?'Elegí un modelo instalado en el panel de Ollama. El historial se mantiene durante esta sesión.':service?'Esta integración todavía no está disponible. Por ahora no se solicita ninguna cuenta.':'Ollama ya puede conectarse. Las demás integraciones siguen pendientes.'}</p></div></div></section>}
        {tab==='settings'&&<section className="settings-view"><div className="page-heading"><span className="micro-label">A TU MANERA</span><h1>Un espacio muy tuyo.</h1><p>Elegí cómo se ve y cómo te acompaña.</p></div><section className="appearance-card glass-card"><div className="section-line"><h2><Palette size={16}/> Apariencia</h2><span className="micro-label">GUARDADO AUTOMÁTICO</span></div><div className="theme-picker" aria-label="Tema">{[[Sun,'light','Claro'],[Moon,'dark','Oscuro'],[Monitor,'system','Sistema']].map(([Icon,id,label])=><button key={id} className={theme===id?'selected':''} aria-pressed={theme===id} onClick={()=>setTheme(id)}><Icon size={15}/>{label}{theme===id&&<Check size={13}/>}</button>)}</div><div className="tint-row"><span>Tinte del cristal</span><div>{TINTS.map(([id,label,color])=><button key={id} style={{'--swatch':color}} title={label} aria-label={label} aria-pressed={tint===id} className={tint===id?'selected':''} onClick={()=>setTint(id)}>{tint===id&&<Check size={12}/>}</button>)}</div></div></section><section className="behavior-card glass-card"><h2><Pin size={16}/> En tu escritorio</h2><label>Borde del monitor<select aria-label="Borde del monitor" value={dock.edge} onChange={e=>{setHovered(false);dock.setEdge(e.target.value)}}><option value="top">Arriba</option><option value="bottom">Abajo</option><option value="left">Izquierda</option><option value="right">Derecha</option></select></label><p className="dock-help">{dock.lateral?'Deslizá el notch verticalmente sobre este borde.':'Deslizá el notch horizontalmente sobre este borde.'} Se imanta al centro cuando lo acercás.</p><span className="dock-alignment">{dock.centered?'✧ Centrado en el borde':'Posición personalizada'}</span><label>Tamaño en reposo<select value={config.size} onChange={e=>onConfig(c=>({...c,size:e.target.value}))}><option value="S">Pequeño</option><option value="M">Mediano</option><option value="L">Grande</option></select></label><label>Siempre visible<input type="checkbox" checked={pinned} onChange={e=>setPinned(e.target.checked)}/></label><div className="settings-actions"><button onClick={dock.center}><Crosshair size={14}/> Centrar en el borde</button><button onClick={()=>safe(()=>invoke('quit_app'))}><Power size={14}/> Cerrar aplicación</button></div></section><ApplicationSettings apps={apps}/><WakeSettings wake={wake}/><VoiceSettings voice={{...voice,active:voice.active||wake.enabled}}/><MemoryPanel ai={ai}/>{ai.storageError&&<p className="ollama-error" role="alert">{ai.storageError}</p>}{personalization}</section>}
      </div>
      <footer className="hub-footer"><span><span className="mini-star">✧</span> Mi pequeño compañero</span><span>{tab==='home'?'Un poquito de compañía.':'Hecho para acompañarte.'}<span className="version-tag"> BETA · 0.16</span></span></footer>
    </section>}
    {error&&<div className="desktop-error" role="alert"><span>{error}</span><IconButton title="Cerrar aviso" onClick={()=>setError('')}><X size={14}/></IconButton></div>}
  </>
}

function OllamaPanel({ai}){
 return <section className="ollama-panel glass-card" aria-label="Conexión Ollama"><div className="section-line"><h2><Cpu size={17}/> Ollama</h2><span className="state-badge">{ai.checking?'Buscando…':ai.connected?'Conectado':'Sin conexión'}</span></div><p>Usá un modelo que ya tengas instalado en tu equipo.</p><div className="ollama-controls"><select aria-label="Modelo de Ollama" value={ai.model} disabled={ai.sending||!ai.models.length} onChange={e=>ai.setModel(e.target.value)}><option value="" disabled>Elegí un modelo</option>{ai.models.map(m=><option key={m} value={m}>{m}</option>)}</select><button className="primary-button" disabled={ai.checking||ai.sending} onClick={ai.refresh}>{ai.checking?'Buscando…':'Detectar modelos'}</button></div>{ai.connected&&!ai.models.length&&<p>Ollama está abierto, pero no hay modelos instalados. Descargá uno desde Ollama y volvé a detectar.</p>}{ai.error&&<p className="ollama-error" role="alert">{ai.error}</p>}<small>Servidor: 127.0.0.1:11434 · No modifica archivos ni ejecuta comandos.</small></section>
}

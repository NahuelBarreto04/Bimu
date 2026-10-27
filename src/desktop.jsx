import React, { useEffect, useRef, useState } from 'react'
import { isTauri, invoke } from '@tauri-apps/api/core'
import { getCurrentWindow, LogicalSize, PhysicalPosition, currentMonitor, cursorPosition } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import { Home, MessageCircle, PanelsTopLeft, Settings2, Grip, ArrowDownLeft, ArrowUpRight, Minus, Sun, Moon, Monitor, Hand, Sparkles, Plug, Github, Globe, Cpu, ArrowRight, Send, Check, Palette, Pin, Crosshair, Power, X, FolderOpen, LoaderCircle, Music2, SkipBack, SkipForward, Play, Pause, ChevronLeft, ChevronRight, Wifi, WifiOff, Battery, Zap, File, Trash2, Upload, Image, Film, FileText, Captions } from 'lucide-react'
import './desktop.css'
import {SettingsPanels} from './SettingsPanels'
import {readOpacity} from './ui-preferences'
import {useDock} from './useDock'
import {useOllama} from './useOllama'
import {useDropZone} from './useDropZone'
import {MessageContent} from './MessageContent'
import {ConversationHistory} from './ConversationPanels'
import {useVoice} from './useVoice'
import {useHitRegions} from './useHitRegions'
import {VoiceControls,VoiceStatus} from './VoicePanels'
import {useStartup} from './useStartup'
import {useHomeAvatar} from './useHomeAvatar'
import {useAssistantActions} from './useAssistantActions'
import {routeAssistantRequest} from './assistant-routing'
import {AssistantResults} from './AssistantPanels'
import {useApplications} from './useApplications'
import {ApplicationConfirmation} from './ApplicationPanels'
import {useWakeListener} from './useWakeListener'
import {WakeIndicator} from './WakePanels'
import {parseSyncedLyrics,lyricIndex} from './lyrics'

export const nativeMode=isTauri()
export const desktopMode=nativeMode||new URLSearchParams(location.search).get('desktop')==='1'
if(desktopMode)document.documentElement.classList.add('desktop-root')
if(desktopMode&&!nativeMode)document.documentElement.classList.add('desktop-preview')
const sizes={S:[80,85],M:[100,105],L:[125,130]}
const SERVICES=[{id:'ollama',name:'Ollama',desc:'Tu inteligencia, en tu equipo.',icon:Cpu,color:'#a6cfbf'}, {id:'github',name:'GitHub',desc:'Repositorios y actividad.',icon:Github,color:'#bba9e8'}, {id:'vercel',name:'Vercel',desc:'Tus proyectos y despliegues.',icon:Globe,color:'#97bbdf'}, {id:'n8n',name:'n8n',desc:'Automatizaciones a tu manera.',icon:PanelsTopLeft,color:'#e7b58e'}]
const saved=(key,fallback)=>{try{return localStorage.getItem(key)||fallback}catch{return fallback}}
function IconButton({title,children,...props}){return <button type="button" className="icon-button" title={title} aria-label={title} {...props}>{children}</button>}
function ShelfIcon({item}){const ext=item.name.split('.').pop().toLowerCase();const image=['png','jpg','jpeg','gif','webp','svg','heic'].includes(ext);const video=['mp4','mov','webm','avi'].includes(ext);const label=item.kind==='folder'?'':ext.slice(0,5).toUpperCase();const Icon=item.kind==='folder'?FolderOpen:image?Image:video?Film:ext==='pdf'?FileText:File;return <span className={'shelf-file-icon '+(item.kind==='folder'?'is-folder':image?'is-image':video?'is-video':ext==='pdf'?'is-pdf':'is-file')}><Icon size={27} strokeWidth={1.5}/>{label&&<span>{label}</span>}</span>}

export function DesktopControls({config,onConfig,onRest,onGreet,expanded,onExpand,personalization,mood,onThinking,reception,onInteract}) {
  const [tab,setTab]=useState('home')
  useHitRegions(nativeMode)
  const ai=useOllama(nativeMode)
  const localReception=useRef({active:false,catching:false,target:[0,0]})
  const receiveRef=reception||localReception
  const chatEnd=useRef()
  useEffect(()=>{onThinking?.(ai.sending)},[ai.sending,onThinking])
  useEffect(()=>{chatEnd.current?.scrollIntoView?.({block:'end',behavior:ai.sending?'auto':'smooth'})},[ai.messages,ai.sending,tab])
  const [theme,setTheme]=useState(()=>saved('companion-theme','dark'))
  const [opacity,setOpacity]=useState(readOpacity)
  const [tint,setTint]=useState(()=>saved('companion-tint','iris'))
  const [pinned,setPinned]=useState(()=>saved('mascot-pinned','true')!=='false')
  const [systemDark,setSystemDark]=useState(()=>matchMedia('(prefers-color-scheme: dark)').matches)
  const [draft,setDraft]=useState(()=>saved('companion-draft',''))
  const [clock,setClock]=useState(()=>new Date())
  useEffect(()=>{const timer=setInterval(()=>setClock(new Date()),10000);return()=>clearInterval(timer)},[])
  const [media,setMedia]=useState(null),[mediaError,setMediaError]=useState('')
  const [lyricsOpen,setLyricsOpen]=useState(false),[lyrics,setLyrics]=useState({status:'idle',lines:[]}),[lyricTime,setLyricTime]=useState(0),[lyricsAttempt,setLyricsAttempt]=useState(0)
  const lyricAnchor=useRef({position:0,at:0,playing:false}),activeLyric=useRef(null)
  useEffect(()=>{lyricAnchor.current={position:media?.position||0,at:performance.now(),playing:!!media?.playing};setLyricTime(media?.position||0)},[media?.position,media?.playing,media?.title,media?.artist])
  useEffect(()=>{if(!lyricsOpen)return;const timer=setInterval(()=>{const a=lyricAnchor.current;setLyricTime(a.position+(a.playing?(performance.now()-a.at)/1000:0))},250);return()=>clearInterval(timer)},[lyricsOpen])
  useEffect(()=>{if(!lyricsOpen)return;let active=true;if(!media?.title||!media?.artist){setLyrics({status:'missing',lines:[]});return()=>{active=false}};setLyrics({status:'loading',lines:[]});invoke('lyrics_lookup',{title:media.title,artist:media.artist,duration:media.duration||0}).then(result=>{if(active){const lines=parseSyncedLyrics(result.syncedLyrics);setLyrics({status:result.status==='synced'&&!lines.length?'missing':result.status,lines})}}).catch(error=>{if(active)setLyrics({status:'error',lines:[],message:String(error)})});return()=>{active=false}},[lyricsOpen,media?.title,media?.artist,media?.duration,lyricsAttempt])
  const currentLyric=lyricIndex(lyrics.lines,lyricTime)
  useEffect(()=>{if(lyricsOpen)activeLyric.current?.scrollIntoView({block:'center',behavior:'smooth'})},[lyricsOpen,currentLyric,lyrics.lines])
  useEffect(()=>{document.documentElement.dataset.lyrics=String(lyricsOpen);return()=>{delete document.documentElement.dataset.lyrics}},[lyricsOpen])
  const [notchPage,setNotchPage]=useState('music'),[shelfItems,setShelfItems]=useState([]),[shelfError,setShelfError]=useState('')
  const refreshShelf=async()=>{if(!nativeMode)return;try{setShelfItems(await invoke('shelf_list'));setShelfError('')}catch(e){setShelfError(String(e))}}
  useEffect(()=>{refreshShelf()},[])
  const changeNotchPage=()=>{setLyricsOpen(false);setNotchPage(page=>page==='music'?'shelf':'music');if(notchPage==='music')refreshShelf()}
  const shelfOpen=async item=>{try{await invoke('shelf_open',{id:item.id});setShelfError('')}catch(e){setShelfError(String(e));setShelfItems(items=>items.map(x=>x.id===item.id?{...x,available:false}:x))}}
  const shelfRemove=async item=>{try{setShelfItems(await invoke('shelf_remove',{id:item.id}));setShelfError('')}catch(e){setShelfError(String(e))}}
  const mediaRef=useRef(null),mediaRevision=useRef(0),mediaMounted=useRef(true)
  const refreshMedia=async()=>{if(!nativeMode)return;const revision=++mediaRevision.current;try{const next=await invoke('media_state',{includeCover:false});if(!mediaMounted.current||revision!==mediaRevision.current)return;const previous=mediaRef.current;const same=next&&previous&&next.title===previous.title&&next.artist===previous.artist;const value=next?{...next,cover:same?previous.cover:null}:null;mediaRef.current=value;setMedia(value);setMediaError('');if(next&&(!same||!previous.cover)){const art=await invoke('media_state',{includeCover:true});if(!mediaMounted.current||!art||!mediaRef.current||art.title!==mediaRef.current.title||art.artist!==mediaRef.current.artist)return;const merged={...mediaRef.current,cover:art.cover};mediaRef.current=merged;setMedia(merged)}}catch(e){if(mediaMounted.current&&revision===mediaRevision.current)setMediaError(String(e))}}
  useEffect(()=>{if(!nativeMode)return;mediaMounted.current=true;refreshMedia();const timer=setInterval(refreshMedia,1500);return()=>{mediaMounted.current=false;mediaRevision.current++;clearInterval(timer)}},[])
  const mediaAction=async action=>{mediaRevision.current++;if(action==='toggle'&&mediaRef.current){const next={...mediaRef.current,playing:!mediaRef.current.playing};mediaRef.current=next;setMedia(next)}try{await invoke('media_control',{action});setTimeout(refreshMedia,250)}catch(e){setMediaError(String(e));refreshMedia()}}
  const timeText=value=>{const n=Math.max(0,Math.floor(Number(value)||0));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`}
  const [systemStatus,setSystemStatus]=useState(null)
  const [online,setOnline]=useState(()=>navigator.onLine)
  useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[])
  useEffect(()=>{if(!nativeMode)return;let active=true;const update=()=>invoke('system_status').then(value=>{if(active)setSystemStatus(value)}).catch(()=>{});update();const timer=setInterval(update,60000);return()=>{active=false;clearInterval(timer)}},[])
  const signal=systemStatus?.wifiSignal
  const statusIcon=systemStatus?.batteryPercent!=null?<span className="system-status battery-status" title={`Batería ${systemStatus.batteryPercent}%${systemStatus.charging?' · cargando':''}`}><Battery size={15}/>{systemStatus.charging&&<Zap className="battery-zap" size={9}/>}<small>{systemStatus.batteryPercent}</small></span>:<span className="system-status" title={!online?'Sin conexión':signal!=null?`Wi-Fi ${signal}%`:'Conexión activa · intensidad no disponible'}>{!online?<WifiOff size={14}/>:signal==null?<Wifi size={14}/>:<span className="wifi-bars">{[1,2,3,4].map(n=><i key={n} className={signal>=n*25?'active':''}/>)}</span>}</span>
  const [voiceNotice,setVoiceNotice]=useState(null)
  const noticeTimer=useRef()
  const voiceFeedback=(state,text)=>{clearTimeout(noticeTimer.current);setVoiceNotice({state,text});noticeTimer.current=setTimeout(()=>setVoiceNotice(null),6000)}
  useEffect(()=>()=>clearTimeout(noticeTimer.current),[])
  const registry=useApplications({native:nativeMode,onResult:ai.recordAction})
  const actions=useAssistantActions({native:nativeMode,onResult:ai.recordAction,onFeedback:voiceFeedback,onActivity:onInteract,onShow:()=>{onExpand(true)}})
  useHomeAvatar(expanded&&tab==='home')
  const apps={...registry,busy:registry.busy||actions.busy||ai.actionBusy||ai.sending,pending:registry.pending||actions.pending||ai.actionProposal,
    isCommand:text=>actions.isCommand(text)||registry.isCommand(text),
    request:async(text,options)=>actions.isCommand(text)?actions.request(text,options):registry.request(text,options),
    confirm:remember=>ai.actionProposal?ai.confirmAction():actions.pending?actions.confirm(remember):registry.confirm(remember),
    cancel:()=>ai.actionProposal?ai.cancelAction():actions.pending?actions.cancel():registry.cancel()}

  const voice=useVoice({native:nativeMode,enabled:expanded&&tab==='chat',busy:ai.sending||ai.choosing||apps.busy||!!apps.pending,onTranscript:text=>{const merged=draft.trim()?draft+'\n'+text:text;if(merged.length>16000)throw Error('El borrador no tiene espacio suficiente. Acortalo antes de volver a grabar.');setDraft(merged)}})
  const wake=useWakeListener({native:nativeMode,device:voice.device,monitor:expanded&&tab==='settings',busy:ai.sending||ai.choosing||apps.busy||!!apps.pending||voice.active||voice.detecting,onRequest:async text=>{
    await routeAssistantRequest(text,{apps,ai,voice:true,onFeedback:voiceFeedback,onShowChat:()=>{setTab('chat');onExpand(true)}})
  },onFeedback:voiceFeedback,onActivity:onInteract})

  const startup=useStartup({native:nativeMode,listenPreferred:wake.preferred,onGreeting:()=>{onGreet();voiceFeedback('idle','¡Hola! Ya estoy acá para acompañarte.')}})
  const drop=useDropZone({native:nativeMode,busy:ai.sending||ai.choosing||voice.active||voice.detecting||apps.busy||!!apps.pending,reception:receiveRef,shelfMode:!expanded,onShelf:items=>{setShelfItems(items);setShelfError('');setLyricsOpen(false);setNotchPage('shelf');setHovered(true)}})
  useEffect(()=>{if(drop.active)onInteract?.()},[drop.active,onInteract])
  const [service,setService]=useState(null)
  const [hovered,setHovered]=useState(false)
  const hoverTimer=useRef()
  useEffect(()=>{
    if(expanded||drop.active)return
    let alive=true,busy=false
    const move=(x,y)=>{const el=document.querySelector('.bimu-eyes');if(!el)return;const r=el.getBoundingClientRect();el.style.setProperty('--eye-x',Math.max(-2,Math.min(2,(x-(r.left+r.width/2))/140))+'px');el.style.setProperty('--eye-y',Math.max(-1.5,Math.min(1.5,(y-(r.top+r.height/2))/140))+'px')}
    const browserMove=e=>move(e.clientX,e.clientY)
    if(!nativeMode){window.addEventListener('pointermove',browserMove);return()=>window.removeEventListener('pointermove',browserMove)}
    const update=async()=>{if(busy)return;busy=true;try{const [point,origin,monitor]=await Promise.all([cursorPosition(),getCurrentWindow().outerPosition(),currentMonitor()]);if(alive&&monitor)move((point.x-origin.x)/monitor.scaleFactor,(point.y-origin.y)/monitor.scaleFactor)}catch{}finally{busy=false}}
    update();const timer=setInterval(update,100)
    return()=>{alive=false;clearInterval(timer)}
  },[expanded,drop.active])
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
  useEffect(()=>{document.documentElement.style.setProperty('--ui-opacity',String(opacity/100));try{localStorage.setItem('bimu-ui-opacity',String(opacity))}catch{}},[opacity])
  useEffect(()=>{document.documentElement.dataset.view=tab},[tab])
  useEffect(()=>{document.documentElement.dataset.receiveLayout=expanded?'panel':'notch'},[expanded])
  const dock=useDock({native:nativeMode,expanded,hovered:hovered||drop.active,receiving:drop.active,tab:!expanded&&lyricsOpen&&!drop.active?'lyrics':tab,size:config.size,voiceVisible:!!voiceNotice||!!apps.pending?.silent,onError:setError})
  const dockCallbacks=useRef(dock);dockCallbacks.current=dock
  // Observe the whole companion surface, including its avatar and quick input.
  // Crossing between descendants must never be treated as leaving the notch.
  useEffect(()=>{
    const surface=document.querySelector('.desktop')||document.body
    const enter=()=>{clearTimeout(hoverTimer.current);if(!expanded)setHovered(true)}
    const leave=e=>{
      if(e.relatedTarget&&surface.contains(e.relatedTarget))return
      clearTimeout(hoverTimer.current);hoverTimer.current=setTimeout(()=>setHovered(false),200)
    }
    surface.addEventListener('pointerenter',enter);surface.addEventListener('pointerleave',leave)
    surface.addEventListener('focusin',enter);surface.addEventListener('focusout',leave)
    return()=>{clearTimeout(hoverTimer.current);surface.removeEventListener('pointerenter',enter);surface.removeEventListener('pointerleave',leave);surface.removeEventListener('focusin',enter);surface.removeEventListener('focusout',leave)}
  },[expanded])
  useEffect(()=>{if(expanded)setHovered(false)},[expanded])
  useEffect(()=>{
    if(!expanded||tab!=='home'||drop.active||actions.searching||actions.search||actions.pending||actions.error)return
    let timer;const restart=()=>{clearTimeout(timer);timer=setTimeout(()=>onExpand(false),20000)}
    restart();window.addEventListener('pointermove',restart);window.addEventListener('pointerdown',restart);window.addEventListener('keydown',restart)
    return()=>{clearTimeout(timer);window.removeEventListener('pointermove',restart);window.removeEventListener('pointerdown',restart);window.removeEventListener('keydown',restart)}
  },[expanded,tab,onExpand,drop.active,actions.searching,actions.search,actions.pending,actions.error])
  useEffect(()=>{
    if(!nativeMode)return
    let disposed=false;let off
    listen('desktop-action',({payload})=>{
      onInteract?.()
      if(payload==='center'){dockCallbacks.current.center();dockCallbacks.current.reanchor()}
      if(payload==='show')dockCallbacks.current.reanchor()
      if(payload==='settings'){onExpand(true);setTab('settings')}
      if(payload==='rest')callbacks.current.onRest()
      if(payload==='greet')callbacks.current.onGreet()
    }).then(fn=>{if(disposed)fn();else off=fn}).catch(e=>setError(String(e)))
    return()=>{disposed=true;off?.()}
  },[onExpand,onInteract])
  const collapse=()=>{setHovered(false);onExpand(false);setTab('home')}
  const openNotch=()=>{if(!dock.consumeDrag()){clearTimeout(hoverTimer.current);setTab('home');onExpand(true)}}
  const submitMessage=async()=>{if(voice.active||ai.sending||ai.choosing||apps.busy||apps.pending)return;const text=draft;await routeAssistantRequest(text,{apps,ai,onAccepted:()=>setDraft(current=>current===text?'':current)})}
  const openQuickChat=e=>{e.preventDefault();clearTimeout(hoverTimer.current);setTab('chat');onExpand(true);if(apps.isCommand(draft)||(ai.connected&&ai.model))submitMessage()}
  const chooseTab=id=>{setTab(id);setService(null)}
  return <>
    <WakeIndicator wake={wake} notice={voiceNotice} pending={apps.pending?.silent?apps.pending:null} onConfirm={()=>{setVoiceNotice({state:'success',text:'Ejecutando pedido…'});apps.confirm(false).then(ok=>voiceFeedback(ok?'success':'error',ok?'Se solicitó la apertura.':'Revisá el resultado del pedido.')).catch(()=>voiceFeedback('error','No pude abrir la aplicación.'))}} onCancel={()=>{apps.cancel();voiceFeedback('idle','Apertura cancelada.')}}/>
    {drop.active&&<section className="drop-surface" aria-label="Recibir archivos o carpeta"><div className="drop-outline"/>{drop.stage==='hover'&&(expanded?<><FolderOpen className="drop-folder-icon" size={23}/><p className="drop-invitation">Soltá los archivos. Yo los recibo.</p></>:<div className="drop-shelf-feedback" role="status"><span className="drop-shelf-icon"><Upload size={22}/></span><strong>Soltá para guardar</strong><small>Tus archivos van a quedar a mano</small></div>)}{drop.stage==='preparing'&&(expanded?<p className="drop-preparing" role="status"><LoaderCircle size={14}/> Preparando el contenido…</p>:<div className="drop-shelf-feedback" role="status"><span className="drop-shelf-icon"><LoaderCircle size={22}/></span><strong>Guardando…</strong></div>)}{drop.stage==='ready'&&<div className="drop-ready"><strong title={drop.preview.name}>{drop.preview.name}</strong><small>{drop.preview.kind==='files'?`${drop.preview.ready}/${drop.preview.entries} archivos listos`:`${drop.preview.truncated?'Más de ':''}${drop.preview.entries} elementos visibles`} · solo lectura</small>{drop.preview.kind==='files'&&<details className="drop-file-list" onToggle={e=>{if(e.currentTarget.open&&!expanded)onExpand(true)}}><summary>Ver archivos</summary>{drop.preview.items.map((item,i)=><p key={i}>{item.name}: {item.detail}</p>)}</details>}<p>¿Qué querés hacer?</p><div><button disabled={drop.accepting||(drop.preview.kind==='files'&&!drop.preview.ready)} onClick={async()=>{if(await drop.accept(ai.acceptDroppedFolder)){setHovered(false);setTab('chat');onExpand(true)}}}>{drop.accepting?'Recibiendo…':'Usar en el chat'}</button><button disabled={drop.accepting} onClick={drop.reset}>Cancelar</button></div></div>}{drop.stage==='error'&&<div className="drop-error" role="alert"><p>{drop.error}</p><button onClick={drop.reset}>Entendido</button></div>}</section>}
    {!expanded&&!drop.active&&<button className="notch-surface" aria-label="Abrir compañero" {...dock.handlers} onClick={openNotch}>
      <span className={'notch-avatar-slot bimu-eyes'+(mood==='sleepy'?' bimu-eyes-sleepy':'')+(media?.playing?' bimu-listening':'')} aria-hidden="true"><i/><i/></span>
      <span className="notch-copy"><strong>Tu compañero</strong><small>{mood==='sleepy'?'Descansando':'Acá, con vos'}</small></span>
      <span className="notch-clock">{clock.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:false})}</span>
      {statusIcon}
      <span className="notch-indicator"><span className="status-dot"/></span>
      <span className="notch-grip"><Grip size={12}/></span>
    </button>}
    {!expanded&&!drop.active&&lyricsOpen&&lyrics.status==='synced'&&currentLyric>=0&&<div className="compact-lyric" aria-live="off"><Music2 size={12}/><span>{lyrics.lines[currentLyric]?.text}</span></div>}
    {!expanded&&!drop.active&&<section className="notch-player" aria-label={notchPage==='music'?'Reproductor de música':'Bandeja de archivos'}>
      <div className="player-heading"><span className="player-date">{clock.toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'}).replaceAll('.','')}</span><time>{clock.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:false})}</time></div>
      {notchPage==='music'?<><div className="player-track"><span className="player-cover">{media?.cover?<img src={media.cover} alt=""/>:<Music2 size={20}/>}</span><span><strong>{media?.title||'Sin música reproduciéndose'}</strong><small>{media?.artist||'Abrí un reproductor para escuchar música'}</small></span></div><div className="player-timeline"><span>{timeText(media?.position)}</span><span className="player-progress"><i style={{width:`${media?.duration?Math.min(100,Math.max(0,media.position/media.duration*100)):0}%`}}/></span><span>{media?.duration?timeText(media.duration):'0:00'}</span></div><div className="player-controls"><button className="lyrics-toggle" aria-label={lyricsOpen?'Cerrar letras':'Ver letras'} aria-pressed={lyricsOpen} disabled={!media?.title||!media?.artist} onClick={()=>setLyricsOpen(open=>!open)}><Captions size={15}/></button><button aria-label="Canción anterior" disabled={!media} onClick={()=>mediaAction('previous')}><SkipBack size={16}/></button><button aria-label={media?.playing?'Pausar':'Reproducir'} disabled={!media} onClick={()=>mediaAction('toggle')}>{media?.playing?<Pause size={19}/>:<Play size={19}/>}</button><button aria-label="Canción siguiente" disabled={!media} onClick={()=>mediaAction('next')}><SkipForward size={16}/></button></div>{lyricsOpen&&<div className="lyrics-panel" aria-label="Letra sincronizada">{lyrics.status==='loading'?<p>Buscando la letra…</p>:lyrics.status==='error'?<div className="lyrics-error"><p>{lyrics.message||'No se pudieron obtener las letras.'}</p><button onClick={()=>setLyricsAttempt(n=>n+1)}>Reintentar</button></div>:lyrics.status==='instrumental'?<p>Esta canción figura como instrumental.</p>:lyrics.status==='missing'?<p>No encontramos una letra sincronizada para esta canción.</p>:<div className="lyrics-lines">{lyrics.lines.map((line,i)=><p key={i} ref={i===currentLyric?activeLyric:null} className={i===currentLyric?'active':''}>{line.text}</p>)}</div>}</div>}{mediaError&&<span className="player-error" role="status">No se pudo controlar la reproducción.</span>}</>:<div className="shelf-view"><div className="shelf-heading"><strong>Archivos a mano</strong><span>{shelfItems.length} {shelfItems.length===1?'elemento':'elementos'}</span></div>{shelfError&&<p className="shelf-error" role="alert">{shelfError}</p>}{shelfItems.length?<div className="shelf-items">{shelfItems.map(item=><div className="shelf-item" key={item.id}><button className="shelf-open" onClick={()=>shelfOpen(item)} title={item.path}><ShelfIcon item={item}/><span><strong>{item.name}</strong><small>{item.available?(item.kind==='folder'?'Carpeta':'Archivo'):'No se encuentra'}</small></span></button><button className="shelf-remove" aria-label={'Quitar '+item.name+' de la bandeja'} onClick={()=>shelfRemove(item)}><Trash2 size={14}/></button></div>)}</div>:<div className="shelf-empty"><span className="shelf-empty-icon"><Upload size={20}/></span><strong>Tu espacio para archivos</strong><small>Arrastrá archivos o carpetas para guardarlos acá</small></div>}</div>}
      <button className="player-menu-arrow player-menu-left" aria-label={notchPage==='music'?'Ver archivos':'Ver música'} onClick={changeNotchPage}><ChevronLeft size={16}/></button><button className="player-menu-arrow player-menu-right" aria-label={notchPage==='music'?'Ver archivos':'Ver música'} onClick={changeNotchPage}><ChevronRight size={16}/></button>
      <nav className="notch-pagination" aria-label="Vistas del notch"><button aria-label="Música" aria-current={notchPage==='music'?'page':undefined} onClick={()=>{setLyricsOpen(false);setNotchPage('music')}}/><button aria-label="Archivos" aria-current={notchPage==='shelf'?'page':undefined} onClick={()=>{setLyricsOpen(false);setNotchPage('shelf');refreshShelf()}}/></nav>
    </section>}
    {expanded&&<section className="glass-shell" inert={drop.active?true:undefined} aria-label="Panel del compañero">
      <header className="hub-header">
        <nav className="hub-tabs" aria-label="Navegación principal">{[[Home,'home','Inicio'],[MessageCircle,'chat','Chat'],[Plug,'connections','Conexiones'],[Settings2,'settings','Ajustes']].map(([Icon,id,label])=><button key={id} title={label} aria-label={label} aria-current={tab===id?'page':undefined} className={tab===id?'selected':''} onClick={()=>chooseTab(id)}><Icon size={16}/><span>{label}</span></button>)}</nav>
        <div className="window-actions"><IconButton title={dock.lateral?"Mover sobre el borde vertical":"Mover sobre el borde horizontal"} {...dock.handlers}><Grip size={16}/></IconButton><IconButton title={resolvedTheme==='dark'?'Cambiar a claro':'Cambiar a oscuro'} onClick={()=>setTheme(resolvedTheme==='dark'?'light':'dark')}>{resolvedTheme==='dark'?<Sun size={16}/>:<Moon size={16}/>}</IconButton><IconButton title="Volver a pequeño" onClick={collapse}><ArrowDownLeft size={16}/></IconButton><IconButton title="Ocultar en la bandeja" onClick={()=>{voice.cancel();wake.pause();safe(()=>getCurrentWindow().hide())}}><Minus size={16}/></IconButton></div>
      </header>
      <div className={'hub-body view-'+tab}>
        <AssistantResults actions={actions}/>{apps.pending&&!apps.pending.silent&&tab!=='chat'&&<ApplicationConfirmation apps={apps}/>}
        {tab==='home'&&<>
          <div className="home-grid"><section className="companion-card glass-card"><div className="companion-copy"><span className="micro-label"><i className="status-dot"/> TU COMPAÑERO</span><h1>{ai.sending?'Estoy pensando…':mood==='sleepy'?'Un momento de calma.':'Acá, con vos.'}</h1><p>{mood==='sleepy'?'Descansando un poquito.':'Un pequeño espacio para tus grandes ideas.'}</p><div className="gesture-buttons"><button onClick={onGreet}><Hand size={14}/> Saludar</button><button onClick={onRest}><Moon size={14}/> Descansar</button></div></div></section>
          <section className="services-card glass-card"><div className="section-line"><span className="micro-label">TU ESPACIO</span><button className="text-link" onClick={()=>chooseTab('connections')}>Configurar <ArrowUpRight size={12}/></button></div><div className="service-pills">{SERVICES.map(({id,name,icon:Icon,color})=><button key={id} onClick={()=>{chooseTab('connections');setService(id)}}><span style={{color}}><Icon size={15}/></span>{name}<span className="empty-dot"/></button>)}</div></section></div>
          <section className="modes-card glass-card" aria-label="Modos rápidos"><div className="section-line"><span className="micro-label">TUS MODOS</span><button className="text-link" onClick={()=>chooseTab('settings')}>Configurar <ArrowUpRight size={12}/></button></div>{actions.items.length?<div className="modes-list">{actions.items.map(item=><button key={item.id} disabled={apps.busy||!!apps.pending} onClick={()=>actions.request(item.name)}><span>{item.name}</span><small>{item.actions.length} acciones</small><ArrowRight size={14}/></button>)}</div>:<p>Creá un atajo en Ajustes para abrir tus aplicaciones y páginas desde acá.</p>}</section>
          <button className="chat-shortcut glass-card" onClick={()=>chooseTab('chat')}><span className="chat-shortcut-icon"><MessageCircle size={18}/></span><span><strong>¿En qué estamos pensando hoy?</strong><small>Tu próxima conversación empieza acá.</small></span><ArrowRight size={17}/></button>
        </>}
        {tab==='chat'&&<section className="chat-view">
          <div className="section-line chat-model-bar"><span className="micro-label">CONVERSACIONES</span><div><select aria-label="Modelo de chat" value={ai.model} disabled={ai.sending||!ai.models.length} onChange={e=>ai.setModel(e.target.value)}><option value="" disabled>Elegí un modelo</option>{ai.models.map(m=><option key={m} value={m}>{m}</option>)}</select><button className="text-link" disabled={ai.sending||ai.choosing||voice.active||apps.busy||!!apps.pending} onClick={ai.newConversation}>Nueva conversación</button></div></div>
          <ConversationHistory ai={{...ai,choosing:ai.choosing||voice.active||apps.busy||!!apps.pending}}/>{ai.storageError&&<p className="ollama-error" role="alert">{ai.storageError}</p>}<section className="workspace-bar" aria-label="Carpeta compartida"><div><FolderOpen size={15}/><span>{ai.folder?ai.folder.name:'Sin contenido compartido'}</span>{ai.folder&&<small>Solo lectura</small>}</div><div><button type="button" disabled={ai.sending||ai.choosing||voice.active||apps.busy||!!apps.pending} onClick={ai.chooseFolder}>{ai.choosing?'Abriendo…':ai.folder?.kind==='files'?'Usar carpeta':ai.folder?'Cambiar':'Compartir carpeta'}</button><button type="button" disabled={ai.sending||ai.choosing||voice.active||apps.busy||!!apps.pending} onClick={ai.chooseFiles}>Agregar archivos</button>{ai.folder&&<button type="button" disabled={ai.sending||ai.choosing||voice.active||apps.busy||!!apps.pending} onClick={ai.revokeFolder}>Quitar</button>}</div></section>
          {ai.folder?.kind==='files'&&<details className="shared-documents"><summary>{ai.folder.count} archivos compartidos</summary>{ai.folder.items.map(item=><div key={item.id}><span>{item.name}{item.truncated?' · extracto parcial':''}</span><button disabled={ai.sending||ai.choosing||voice.active||apps.busy||!!apps.pending} aria-label={'Quitar '+item.name} onClick={()=>ai.removeFile(item.id)}>Quitar</button></div>)}</details>}{!!ai.folder?.issues?.length&&<details className="shared-documents"><summary>No se pudieron agregar {ai.folder.issues.length} archivos</summary>{ai.folder.issues.map((item,i)=><p key={i}>{item.name}: {item.detail}</p>)}</details>}{ai.folder&&<p className="workspace-hint">{ai.folder.kind==='files'?'Los adjuntos preparados se envían como contexto al modelo. Podés compararlos por sus nombres.':'Los archivos consultados se envían al modelo elegido.'} {ai.folder.kind==='files'?'':ai.toolsSupport===null?'Comprobando herramientas…':ai.toolsSupport?'Podés preguntar por este proyecto.':'Este modelo no admite herramientas o no se pudo comprobar.'}</p>}
          {!!ai.activity.length&&<details className="tool-activity" open={ai.sending||ai.activity.some(tool=>tool.status==='error')}><summary>Herramientas de Bimu · {ai.activity.length}</summary><ul>{ai.activity.map((tool,i)=><li key={i}><span>{({read_file:'Leer archivo',list_files:'Listar archivos',get_current_time:'Consultar hora',search_applications:'Buscar aplicación',open_application:'Preparar apertura',search_folders:'Buscar carpeta',open_folder:'Preparar carpeta',search_files:'Buscar archivo',open_file:'Preparar archivo'})[tool.name]||tool.name} {tool.path}</span><small>{({running:'En curso',done:'Completado',error:'No disponible',stopped:'Detenido'})[tool.status]}</small>{tool.detail&&<small className="tool-detail">{tool.detail}</small>}</li>)}</ul></details>}
          {ai.messages.length?<div className="chat-history" aria-live="polite">{ai.messages.map((m,i)=><article key={i} className={'chat-message '+m.role}><span>{m.role==='user'?'Vos':'Bimu'}</span><MessageContent content={m.content} markdown={m.role==='assistant'}/>{m.interrupted&&<small className="chat-notice">Respuesta interrumpida</small>}</article>)}{ai.sending&&<div className="thinking" role="status"><Sparkles size={14}/> Bimu está pensando…</div>}<div ref={chatEnd}/></div>:<div className="chat-empty"><span className="large-orb"><Sparkles size={26}/></span><h1>Un lugar para tus ideas.</h1><p>{ai.connected&&ai.model?'Tu modelo está listo. ¿Qué hacemos hoy?':'Conectá Ollama y elegí uno de tus modelos para empezar.'}</p>{(!ai.connected||!ai.model)&&<button className="primary-button" onClick={()=>{chooseTab('connections');setService('ollama')}}><Cpu size={15}/> Configurar Ollama <ArrowRight size={14}/></button>}</div>}
          {ai.error&&<p className="ollama-error" role="alert">{ai.error}</p>}{ai.notice&&<p className="chat-notice" role="status">{ai.notice}</p>}
          <ApplicationConfirmation apps={apps}/><VoiceStatus voice={voice}/><form className="composer glass-card" onSubmit={e=>{e.preventDefault();submitMessage()}}><textarea disabled={voice.active} aria-label="Borrador de mensaje" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submitMessage()}}} maxLength={16000} placeholder="Escribile a Bimu…" rows={2}/><div><small>{ai.sending?'Generando respuesta…':ai.connected&&ai.model?'Enter para enviar · Shift+Enter para otra línea':'Conectá Ollama para enviar'}</small><div className="send-controls"><VoiceControls voice={voice} busy={ai.sending||ai.choosing||apps.busy||!!apps.pending||wake.enabled}/>{ai.sending?<button type="button" className="stop-generation" disabled={ai.stopping} onClick={ai.stop}>{ai.stopping?'Deteniendo…':'Detener'}</button>:<IconButton title="Enviar mensaje" type="submit" disabled={voice.active||ai.choosing||apps.busy||!!apps.pending||(!apps.isCommand(draft)&&(!ai.connected||!ai.model))||!draft.trim()}><Send size={16}/></IconButton>}</div></div></form>
        </section>}
        {tab==='connections'&&<section><div className="page-heading"><span className="micro-label">TODO EN SU LUGAR</span><h1>Conectá tu mundo.</h1><p>Un espacio para tu IA y las herramientas que usás.</p></div><div className="connection-grid">{SERVICES.map(({id,name,desc,icon:Icon,color})=><button key={id} className={'connection-tile glass-card '+(service===id?'chosen':'')} onClick={()=>setService(id)} aria-pressed={service===id}><span className="service-icon" style={{color}}><Icon size={23}/></span><span><strong>{name}</strong><small>{desc}</small></span><span className="state-badge">{id==='ollama'&&ai.connected?'Conectado':'Pendiente'}</span></button>)}</div><OllamaPanel ai={ai}/><div className="connection-note glass-card"><Plug size={18}/><div><strong>{service==='ollama'?'Tu IA en tu equipo':service?SERVICES.find(s=>s.id===service)?.name+': conexión pendiente':'Conectá tu modelo local'}</strong><p>{service==='ollama'?'Elegí un modelo instalado en el panel de Ollama. El historial se mantiene durante esta sesión.':service?'Esta integración todavía no está disponible. Por ahora no se solicita ninguna cuenta.':'Ollama ya puede conectarse. Las demás integraciones siguen pendientes.'}</p></div></div></section>}
        {tab==='settings'&&<SettingsPanels theme={theme} setTheme={setTheme} tint={tint} setTint={setTint} opacity={opacity} setOpacity={setOpacity} dock={dock} setHovered={setHovered} config={config} onConfig={onConfig} pinned={pinned} setPinned={setPinned} safe={safe} voice={voice} wake={wake} ai={ai} apps={apps} actions={actions} startup={startup} personalization={personalization}/> }
      </div>
      <footer className="hub-footer"><span><span className="mini-star">✧</span> Mi pequeño compañero</span></footer>
    </section>}
    {error&&<div className="desktop-error" role="alert"><span>{error}</span><IconButton title="Cerrar aviso" onClick={()=>setError('')}><X size={14}/></IconButton></div>}
  </>
}

function OllamaPanel({ai}){
 return <section className="ollama-panel glass-card" aria-label="Conexión Ollama"><div className="section-line"><h2><Cpu size={17}/> Ollama</h2><span className="state-badge">{ai.checking?'Buscando…':ai.connected?'Conectado':'Sin conexión'}</span></div><p>Usá un modelo que ya tengas instalado en tu equipo.</p><div className="ollama-controls"><select aria-label="Modelo de Ollama" value={ai.model} disabled={ai.sending||!ai.models.length} onChange={e=>ai.setModel(e.target.value)}><option value="" disabled>Elegí un modelo</option>{ai.models.map(m=><option key={m} value={m}>{m}</option>)}</select><button className="primary-button" disabled={ai.checking||ai.sending} onClick={ai.refresh}>{ai.checking?'Buscando…':'Detectar modelos'}</button></div>{ai.connected&&!ai.models.length&&<p>Ollama está abierto, pero no hay modelos instalados. Descargá uno desde Ollama y volvé a detectar.</p>}{ai.error&&<p className="ollama-error" role="alert">{ai.error}</p>}<small>Servidor: 127.0.0.1:11434</small>{ai.connected&&ai.model&&<p className="workspace-hint">{ai.toolsSupport===null?'Comprobando herramientas del modelo…':ai.toolsSupport?'Autonomía disponible: hora, aplicaciones, carpetas y documentos. Las apps con coincidencia exacta se abren directamente; los archivos requieren confirmar el destino.':'Los pedidos directos de apertura se resuelven en Bimu. Este modelo no admite herramientas o no se pudo comprobar: para otros pedidos de autonomía elegí uno compatible, como Qwen3.'}</p>}</section>
}

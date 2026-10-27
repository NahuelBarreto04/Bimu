import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isTauri, invoke } from '@tauri-apps/api/core'
import { getCurrentWindow, LogicalSize, PhysicalPosition, currentMonitor, cursorPosition } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import { Home, MessageCircle, PanelsTopLeft, Settings2, Settings, Grip, ArrowDownLeft, ArrowUpRight, Minus, Sun, Moon, Monitor, Hand, Sparkles, Plug, Github, Globe, Cpu, ArrowRight, Send, Check, Palette, Pin, Crosshair, Power, X, FolderOpen, LoaderCircle, Music2, SkipBack, SkipForward, Play, Pause, ChevronLeft, ChevronRight, Wifi, WifiOff, Battery, Zap, File, Trash2, Upload, Image, Film, FileText, Captions, ArrowUp } from 'lucide-react'
import './desktop.css'
import {SettingsPanels} from './SettingsPanels'
import {readOpacity} from './ui-preferences'
import {useDock} from './useDock'
import {useDropZone} from './useDropZone'
import {useHitRegions} from './useHitRegions'
import {useStartup} from './useStartup'
import {useAssistantActions} from './useAssistantActions'
import {useApplications} from './useApplications'
import {parseSyncedLyrics,lyricIndex} from './lyrics'
import {WeatherPanel} from './WeatherPanel'
import {QuickSettings,BIMU_COLORS,validBimuColor} from './QuickSettings'
import {createNotchHoverController} from './notch-hover'
import {notchSize,dockPosition} from './dock-geometry'

export const nativeMode=isTauri()
export const desktopMode=true
if(desktopMode)document.documentElement.classList.add('desktop-root')
if(desktopMode&&!nativeMode)document.documentElement.classList.add('desktop-preview')
const saved=(key,fallback)=>{try{return localStorage.getItem(key)||fallback}catch{return fallback}}
function IconButton({title,children,...props}){return <button type="button" className="icon-button" title={title} aria-label={title} {...props}>{children}</button>}
function CapsLabel({enabled}){return <><ArrowUp size={13} strokeWidth={2} aria-hidden="true"/><span>Mayúsculas <b className={enabled?'caps-on':'caps-off'}>{enabled?'activadas':'desactivadas'}</b></span></>}
function SyncedLyrics({lines,index}){const viewport=useRef(null),active=useRef(null),last=useRef(-1)
 useLayoutEffect(()=>{const box=viewport.current,line=active.current;if(!box||!line)return;const target=Math.max(0,box.scrollTop+line.getBoundingClientRect().top-box.getBoundingClientRect().top-(box.clientHeight-line.offsetHeight)/2);const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;box.scrollTo({top:target,behavior:reduced||last.current<0?'instant':'smooth'});last.current=index},[index,lines])
 return <div className="lyrics-scroll" ref={viewport}><div className="lyrics-lines">{lines.map((line,i)=><p key={`${line.time}-${i}`} ref={i===index?active:null} className={i===index?'active':''}>{line.text}</p>)}</div></div>
}
function ShelfIcon({item}){const ext=item.name.split('.').pop().toLowerCase();const image=['png','jpg','jpeg','gif','webp','svg','heic'].includes(ext);const video=['mp4','mov','webm','avi'].includes(ext);const label=item.kind==='folder'?'':ext.slice(0,5).toUpperCase();const Icon=item.kind==='folder'?FolderOpen:image?Image:video?Film:ext==='pdf'?FileText:File;return <span className={'shelf-file-icon '+(item.kind==='folder'?'is-folder':image?'is-image':video?'is-video':ext==='pdf'?'is-pdf':'is-file')}><Icon size={27} strokeWidth={1.5}/>{label&&<span>{label}</span>}</span>}

export function DesktopControls({config,onConfig,expanded,onExpand,mood,reception,onInteract}) {
  const [tab,setTab]=useState('quick-settings')
  useHitRegions(nativeMode)
  const localReception=useRef({active:false,catching:false,target:[0,0]})
  const receiveRef=reception||localReception
  const [theme,setTheme]=useState(()=>saved('companion-theme','dark'))
  const [opacity,setOpacity]=useState(readOpacity)
  const [bimuColor,setBimuColor]=useState(()=>validBimuColor(saved('bimu-notch-color','neutral')))
  const [pinned,setPinned]=useState(()=>saved('mascot-pinned','true')!=='false')
  const [systemDark,setSystemDark]=useState(()=>matchMedia('(prefers-color-scheme: dark)').matches)
  const [clock,setClock]=useState(()=>new Date())
  useEffect(()=>{const timer=setInterval(()=>setClock(new Date()),10000);return()=>clearInterval(timer)},[])
  const [media,setMedia]=useState(null),[mediaError,setMediaError]=useState('')
  useEffect(()=>{
    const root=document.documentElement;let active=true
    if(!media?.cover){root.style.removeProperty('--cover-glow');return}
    const cover=new window.Image();cover.onload=()=>{if(!active)return;try{const canvas=document.createElement('canvas');canvas.width=24;canvas.height=24;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(cover,0,0,24,24);const data=ctx.getImageData(0,0,24,24).data,buckets=new Map();for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b);if(data[i+3]<128||max<35||min>225)continue;const key=[r,g,b].map(v=>Math.floor(v/48)).join(',');const bucket=buckets.get(key)||{r:0,g:0,b:0,weight:0};const weight=1+(max-min)/160;bucket.r+=r*weight;bucket.g+=g*weight;bucket.b+=b*weight;bucket.weight+=weight;buckets.set(key,bucket)}const best=[...buckets.values()].sort((a,b)=>b.weight-a.weight)[0];if(best)root.style.setProperty('--cover-glow',`${Math.round(best.r/best.weight)},${Math.round(best.g/best.weight)},${Math.round(best.b/best.weight)}`);else root.style.removeProperty('--cover-glow')}catch{root.style.removeProperty('--cover-glow')}};cover.onerror=()=>{if(active)root.style.removeProperty('--cover-glow')};cover.src=media.cover;return()=>{active=false}
  },[media?.cover])
  const [lyricsOpen,setLyricsOpen]=useState(false),[lyrics,setLyrics]=useState({status:'idle',lines:[]}),[lyricTime,setLyricTime]=useState(0),[lyricsAttempt,setLyricsAttempt]=useState(0)
  const lyricAnchor=useRef({position:0,at:0,playing:false})
  useEffect(()=>{const latency=media?.playing&&media?.sampledAtMs?Math.max(0,Math.min(2,(Date.now()-media.sampledAtMs)/1000)):0;const position=(media?.position||0)+latency;lyricAnchor.current={position,at:performance.now(),playing:!!media?.playing};setLyricTime(position)},[media?.position,media?.playing,media?.title,media?.artist,media?.sampledAtMs])
  useEffect(()=>{if(!lyricsOpen)return;const timer=setInterval(()=>{const a=lyricAnchor.current;setLyricTime(a.position+(a.playing?(performance.now()-a.at)/1000:0))},100);return()=>clearInterval(timer)},[lyricsOpen])
  useEffect(()=>{if(!lyricsOpen)return;let active=true;if(!media?.title||!media?.artist){setLyrics({status:'missing',lines:[]});return()=>{active=false}};setLyrics({status:'loading',lines:[]});invoke('lyrics_lookup',{title:media.title,artist:media.artist,duration:media.duration||0}).then(result=>{if(active){const lines=parseSyncedLyrics(result.syncedLyrics);setLyrics({status:result.status==='synced'&&!lines.length?'missing':result.status,lines})}}).catch(error=>{if(active)setLyrics({status:'error',lines:[],message:String(error)})});return()=>{active=false}},[lyricsOpen,media?.title,media?.artist,media?.duration,lyricsAttempt])
  const currentLyric=lyricIndex(lyrics.lines,lyricTime)
  const [notchPage,setNotchPage]=useState('music'),[shelfItems,setShelfItems]=useState([]),[shelfError,setShelfError]=useState(''),[settingsInitial,setSettingsInitial]=useState('app'),[modeResult,setModeResult]=useState(null),[runningMode,setRunningMode]=useState(null)
  const refreshShelf=async()=>{if(!nativeMode)return;try{setShelfItems(await invoke('shelf_list'));setShelfError('')}catch(e){setShelfError(String(e))}}
  useEffect(()=>{refreshShelf()},[])
  const [pageMotion,setPageMotion]=useState({direction:0,sequence:0})
  const targetPage=useRef('music'),pageGhost=useRef(null),pageTimer=useRef()
  const clearPageGhost=()=>{clearTimeout(pageTimer.current);pageGhost.current?.remove();pageGhost.current=null}
  useEffect(()=>()=>clearPageGhost(),[])
  const navigateNotch=(page,direction)=>{if(page===targetPage.current)return;const pages=['music','shelf','modes','weather'];const from=pages.indexOf(targetPage.current),to=pages.indexOf(page);const move=direction||((to-from+pages.length)%pages.length<=pages.length/2?1:-1);clearPageGhost();const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;if(!reduced){const player=document.querySelector('.notch-player'),source=player?.querySelector('.notch-page:not(.notch-page-ghost)');if(player&&source){const rect=source.getBoundingClientRect(),parent=player.getBoundingClientRect(),ghost=source.cloneNode(true);ghost.className='notch-page notch-page-ghost '+(move>0?'moving-left':'moving-right');ghost.setAttribute('aria-hidden','true');ghost.setAttribute('inert','');ghost.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));Object.assign(ghost.style,{left:(rect.left-parent.left)+'px',top:(rect.top-parent.top)+'px',width:rect.width+'px'});player.appendChild(ghost);pageGhost.current=ghost;pageTimer.current=setTimeout(clearPageGhost,320)}}targetPage.current=page;setNotchPage(page);setPageMotion(current=>({direction:reduced?0:move,sequence:current.sequence+1}));if(page==='shelf')refreshShelf()}
  const changeNotchPage=direction=>{const pages=['music','shelf','modes','weather'];navigateNotch(pages[(pages.indexOf(targetPage.current)+direction+pages.length)%pages.length],direction)}
  const shelfOpen=async item=>{try{await invoke('shelf_open',{id:item.id});setShelfError('')}catch(e){setShelfError(String(e));setShelfItems(items=>items.map(x=>x.id===item.id?{...x,available:false}:x))}}
  const shelfRemove=async item=>{try{setShelfItems(await invoke('shelf_remove',{id:item.id}));setShelfError('')}catch(e){setShelfError(String(e))}}
  const mediaRef=useRef(null),mediaRevision=useRef(0),mediaMounted=useRef(true)
  const refreshMedia=async()=>{if(!nativeMode)return;const revision=++mediaRevision.current;try{const next=await invoke('media_state',{includeCover:false});if(!mediaMounted.current||revision!==mediaRevision.current)return;const previous=mediaRef.current;const same=next&&previous&&next.title===previous.title&&next.artist===previous.artist;const value=next?{...next,cover:same?previous.cover:null}:null;mediaRef.current=value;setMedia(value);setMediaError('');if(next&&(!same||!previous.cover)){const art=await invoke('media_state',{includeCover:true});if(!mediaMounted.current||!art||!mediaRef.current||art.title!==mediaRef.current.title||art.artist!==mediaRef.current.artist)return;const merged={...mediaRef.current,cover:art.cover};mediaRef.current=merged;setMedia(merged)}}catch(e){if(mediaMounted.current&&revision===mediaRevision.current)setMediaError(String(e))}}
  useEffect(()=>{if(!nativeMode)return;mediaMounted.current=true;refreshMedia();const timer=setInterval(refreshMedia,1500);return()=>{mediaMounted.current=false;mediaRevision.current++;clearInterval(timer)}},[])
  const mediaAction=async action=>{mediaRevision.current++;if(action==='toggle'&&mediaRef.current){const anchor=lyricAnchor.current;const elapsed=anchor.playing?Math.max(0,(performance.now()-anchor.at)/1000):0;const next={...mediaRef.current,position:anchor.position+elapsed,sampledAtMs:Date.now(),playing:!mediaRef.current.playing};mediaRef.current=next;setMedia(next)}try{await invoke('media_control',{action});setTimeout(refreshMedia,250)}catch(e){setMediaError(String(e));refreshMedia()}}
  const timeText=value=>{const n=Math.max(0,Math.floor(Number(value)||0));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`}
  const [systemStatus,setSystemStatus]=useState(null)
  const [online,setOnline]=useState(()=>navigator.onLine)
  useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[])
  useEffect(()=>{if(!nativeMode)return;let active=true;const update=()=>invoke('system_status').then(value=>{if(active)setSystemStatus(value)}).catch(()=>{});update();const timer=setInterval(update,60000);return()=>{active=false;clearInterval(timer)}},[])
  const signal=systemStatus?.wifiSignal
  const statusIcon=systemStatus?.batteryPercent!=null?<span className="system-status battery-status" title={`Batería ${systemStatus.batteryPercent}%${systemStatus.charging?' · cargando':''}`}><Battery size={15}/>{systemStatus.charging&&<Zap className="battery-zap" size={9}/>}<small>{systemStatus.batteryPercent}</small></span>:<span className="system-status" title={!online?'Sin conexión':signal!=null?`Wi-Fi ${signal}%`:'Conexión activa · intensidad no disponible'}>{!online?<WifiOff size={14}/>:signal==null?<Wifi size={14}/>:<span className="wifi-bars">{[1,2,3,4].map(n=><i key={n} className={signal>=n*25?'active':''}/>)}</span>}</span>
  const [capsNotice,setCapsNotice]=useState(null)
  useEffect(()=>{if(!nativeMode)return;let alive=true,off,timer;listen('caps-lock-changed',({payload})=>{if(!alive)return;setCapsNotice(!!payload);clearTimeout(timer);timer=setTimeout(()=>setCapsNotice(null),2200)}).then(unlisten=>{if(alive)off=unlisten;else unlisten()}).catch(()=>{});return()=>{alive=false;clearTimeout(timer);off?.()}},[])
  const registry=useApplications({native:nativeMode,onResult:()=>{}})
  const actions=useAssistantActions({native:nativeMode,onActivity:onInteract})
  const apps=registry
  const runMode=async item=>{if(runningMode||actions.busy)return;setModeResult(null);setRunningMode(item.id);const result=await actions.runButton(item.id);setRunningMode(null);if(result){setModeResult(result);if(result.results.every(step=>step.ok))setTimeout(()=>setModeResult(current=>current===result?null:current),6000)}}
  const startup=useStartup({native:nativeMode,listenPreferred:false})
  const drop=useDropZone({native:nativeMode,busy:apps.busy||actions.busy,reception:receiveRef,shelfMode:true,onShelf:items=>{setShelfItems(items);setShelfError('');clearPageGhost();targetPage.current='shelf';setPageMotion(current=>({direction:0,sequence:current.sequence+1}));setNotchPage('shelf');onExpand(false);setHovered(true)}})
  useEffect(()=>{if(drop.active)onInteract?.()},[drop.active,onInteract])
  const [hovered,setHovered]=useState(false),[hoverPreview,setHoverPreview]=useState(false)
  const [avoidOverlap,setAvoidOverlap]=useState(()=>saved('bimu-avoid-overlap','true')!=='false'),[overlapping,setOverlapping]=useState(false)
  useEffect(()=>{try{localStorage.setItem('bimu-avoid-overlap',String(avoidOverlap))}catch{}},[avoidOverlap])
  const lyricsVisible=lyricsOpen&&(!hovered||notchPage==='music')
  useEffect(()=>{document.documentElement.dataset.lyrics=String(lyricsVisible);return()=>{delete document.documentElement.dataset.lyrics}},[lyricsVisible])
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
  const safe=async(fn)=>{try{if(nativeMode)await fn();setError('')}catch(e){setError('No se pudo completar la acción: '+String(e))}}
  const resolvedTheme=theme==='system'?(systemDark?'dark':'light'):theme
  useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)');const update=()=>setSystemDark(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[])
  useEffect(()=>{
    document.documentElement.dataset.theme=resolvedTheme
    localStorage.setItem('companion-theme',theme)
  },[theme,resolvedTheme])
  useEffect(()=>{safe(()=>getCurrentWindow().setAlwaysOnTop(pinned));localStorage.setItem('mascot-pinned',String(pinned))},[pinned])
  useEffect(()=>{document.documentElement.style.setProperty('--ui-opacity',String(opacity/100));try{localStorage.setItem('bimu-ui-opacity',String(opacity))}catch{}},[opacity])
  useEffect(()=>{const color=BIMU_COLORS.find(item=>item[0]===bimuColor)||BIMU_COLORS[0];document.documentElement.style.setProperty('--notch-rgb',color[resolvedTheme==='light'?4:3]);document.documentElement.style.setProperty('--bimu-swatch',color[2]);try{localStorage.setItem('bimu-notch-color',bimuColor)}catch{}},[bimuColor,resolvedTheme])
  useEffect(()=>{document.documentElement.dataset.view=tab},[tab])
  useEffect(()=>{document.documentElement.dataset.receiveLayout='notch'},[expanded])
  const dock=useDock({native:nativeMode,expanded,hovered:hovered||drop.active,preview:hoverPreview&&!drop.active,retracted:avoidOverlap&&overlapping,receiving:drop.active,tab:!expanded&&lyricsVisible&&!drop.active?(lyrics.status==='synced'&&currentLyric>=0?'lyrics':'lyrics-loading'):tab,size:config.size,onError:setError})
  useEffect(()=>{if(!nativeMode||!avoidOverlap){setOverlapping(false);return}let alive=true,busy=false,last=null,count=0;const update=async()=>{if(busy||expanded||drop.active)return;busy=true;try{const monitor=await currentMonitor();if(!monitor)return;const scale=monitor.scaleFactor,a=monitor.workArea,area={x:a.position.x,y:a.position.y,width:a.size.width,height:a.size.height};const [w,h]=notchSize(dock.edge,'idle',config.size,lyricsOpen?'lyrics':'home');const width=Math.min(Math.round(w*scale),area.width),height=Math.min(Math.round(h*scale),area.height),p=dockPosition(area,width,height,dock.edge,dock.fraction);const value=await invoke('window_overlaps_notch',{rect:{left:p.x,top:p.y,right:p.x+width,bottom:p.y+height}});if(!alive)return;if(value===last)count++;else{last=value;count=1}if(count>=2)setOverlapping(value)}catch{/* Keep the last stable state if Windows cannot be queried. */}finally{busy=false}};update();const timer=setInterval(update,500);return()=>{alive=false;clearInterval(timer)}},[avoidOverlap,expanded,drop.active,dock.edge,dock.fraction,config.size,lyricsOpen])
  const dockCallbacks=useRef(dock);dockCallbacks.current=dock
  // Observe the whole companion surface.
  // Crossing between descendants must never be treated as leaving the notch.
  useEffect(()=>{
    const surface=document.querySelector('.desktop')||document.body
    const controller=createNotchHoverController({surface,open:()=>{clearTimeout(hoverTimer.current);if(!expanded)setHovered(true)},preview:setHoverPreview,close:()=>setHovered(false)})
    surface.addEventListener('pointerenter',controller.pointerEnter);surface.addEventListener('pointerleave',controller.pointerLeave)
    surface.addEventListener('focusin',controller.focusIn);surface.addEventListener('focusout',controller.focusOut)
    return()=>{controller.dispose();clearTimeout(hoverTimer.current);surface.removeEventListener('pointerenter',controller.pointerEnter);surface.removeEventListener('pointerleave',controller.pointerLeave);surface.removeEventListener('focusin',controller.focusIn);surface.removeEventListener('focusout',controller.focusOut)}
  },[expanded])
  useEffect(()=>{if(expanded||drop.active){setHovered(false);setHoverPreview(false)}},[expanded,drop.active])
  useEffect(()=>{
    if(!nativeMode)return
    let disposed=false;let off
    listen('desktop-action',({payload})=>{
      onInteract?.()
      if(payload==='center'){dockCallbacks.current.center();dockCallbacks.current.reanchor()}
      if(payload==='show')dockCallbacks.current.reanchor()
      if(payload==='settings'){onExpand(true);setTab('quick-settings')}
    }).then(fn=>{if(disposed)fn();else off=fn}).catch(e=>setError(String(e)))
    return()=>{disposed=true;off?.()}
  },[onExpand,onInteract])
  const collapse=()=>{setHovered(false);onExpand(false);setTab('quick-settings')}
  const openNotch=()=>{if(!dock.consumeDrag()){clearTimeout(hoverTimer.current);setTab('quick-settings');onExpand(true)}}
  const openQuickSettings=()=>{clearTimeout(hoverTimer.current);setHovered(false);setTab('quick-settings');onExpand(true)}
  const openModeSettings=()=>{setSettingsInitial('apps');setTab('settings');setHovered(false);onExpand(true)}
  return <>
    {drop.active&&<section className="drop-surface" aria-label="Recibir archivos o carpeta"><div className="drop-outline"/>{drop.stage==='hover'&&<div className="drop-shelf-feedback" role="status"><span className="drop-shelf-icon"><Upload size={22}/></span><strong>Soltá para guardar</strong><small>Tus archivos van a quedar a mano</small></div>}{drop.stage==='preparing'&&<div className="drop-shelf-feedback" role="status"><span className="drop-shelf-icon"><LoaderCircle size={22}/></span><strong>Guardando…</strong></div>}{drop.stage==='error'&&<div className="drop-error" role="alert"><p>{drop.error}</p><button onClick={drop.reset}>Entendido</button></div>}</section>}
    {!expanded&&!drop.active&&<button className="notch-surface" aria-label="Abrir compañero" {...dock.handlers} onClick={openNotch}>
      {dock.state==='idle'&&capsNotice!==null?<span className="caps-notice" role="status"><CapsLabel enabled={capsNotice}/></span>:dock.state==='idle'&&lyricsOpen&&lyrics.status==='synced'&&currentLyric>=0?<span className="compact-lyric-inline"><Music2 size={13}/><span className="compact-lyric-transition" key={`${media?.title}-${currentLyric}`}>{lyrics.lines[currentLyric]?.text}</span></span>:<span className={'notch-avatar-slot bimu-eyes'+(mood==='sleepy'?' bimu-eyes-sleepy':'')+(media?.playing?' bimu-listening':'')} aria-hidden="true"><i/><i/></span>}
      <span className="notch-copy"><strong>Tu compañero</strong><small>{mood==='sleepy'?'Descansando':'Acá, con vos'}</small></span>
      {!(dock.state==='idle'&&(capsNotice!==null||(lyricsOpen&&lyrics.status==='synced'&&currentLyric>=0)))&&<><span className="notch-clock">{clock.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:false})}</span>{statusIcon}</>}
      <span className="notch-indicator"><span className="status-dot"/></span>
      <span className="notch-grip"><Grip size={12}/></span>
    </button>}
    {!expanded&&!drop.active&&<section className="notch-player" aria-label={{music:'Reproductor de música',shelf:'Bandeja de archivos',modes:'Atajos rápidos',weather:'Clima'}[notchPage]}>
      <div className="player-heading">{capsNotice!==null?<span className="caps-peek" role="status"><CapsLabel enabled={capsNotice}/></span>:<><span className="player-date">{clock.toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'}).replaceAll('.','')}</span><time>{clock.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:false})}</time></>}</div>
      <div key={pageMotion.sequence} className={'notch-page '+(pageMotion.direction>0?'enter-from-right':pageMotion.direction<0?'enter-from-left':'')}>{notchPage==='music'?<><div className="player-track"><span className="player-cover">{media?.cover?<img src={media.cover} alt=""/>:<Music2 size={20}/>}</span><span><strong>{media?.title||'Sin música reproduciéndose'}</strong><small>{media?.artist||'Abrí un reproductor para escuchar música'}</small></span></div><div className="player-timeline"><span>{timeText(media?.position)}</span><span className="player-progress"><i style={{width:`${media?.duration?Math.min(100,Math.max(0,media.position/media.duration*100)):0}%`}}/></span><span>{media?.duration?timeText(media.duration):'0:00'}</span></div><div className="player-controls"><button className="lyrics-toggle" aria-label={lyricsOpen?'Cerrar letras':'Ver letras'} aria-pressed={lyricsOpen} disabled={!media?.title||!media?.artist} onClick={()=>setLyricsOpen(open=>!open)}><Captions size={15}/></button><button aria-label="Canción anterior" disabled={!media} onClick={()=>mediaAction('previous')}><SkipBack size={16}/></button><button aria-label={media?.playing?'Pausar':'Reproducir'} disabled={!media} onClick={()=>mediaAction('toggle')}>{media?.playing?<Pause size={19}/>:<Play size={19}/>}</button><button aria-label="Canción siguiente" disabled={!media} onClick={()=>mediaAction('next')}><SkipForward size={16}/></button></div>{lyricsOpen&&<div className="lyrics-panel" aria-label="Letra sincronizada">{lyrics.status==='loading'?<p>Buscando la letra…</p>:lyrics.status==='error'?<div className="lyrics-error"><p>{lyrics.message||'No se pudieron obtener las letras.'}</p><button onClick={()=>setLyricsAttempt(n=>n+1)}>Reintentar</button></div>:lyrics.status==='instrumental'?<p>Esta canción figura como instrumental.</p>:lyrics.status==='missing'?<p>No encontramos una letra sincronizada para esta canción.</p>:<SyncedLyrics lines={lyrics.lines} index={currentLyric}/>}</div>}{mediaError&&<span className="player-error" role="status">No se pudo controlar la reproducción.</span>}</>:notchPage==='shelf'?<div className="shelf-view"><div className="shelf-heading"><strong>Archivos a mano</strong><span>{shelfItems.length} {shelfItems.length===1?'elemento':'elementos'}</span></div>{shelfError&&<p className="shelf-error" role="alert">{shelfError}</p>}{shelfItems.length?<div className="shelf-items">{shelfItems.map(item=><div className="shelf-item" key={item.id}><button className="shelf-open" onClick={()=>shelfOpen(item)} title={item.path}><ShelfIcon item={item}/><span><strong>{item.name}</strong><small>{item.available?(item.kind==='folder'?'Carpeta':'Archivo'):'No se encuentra'}</small></span></button><button className="shelf-remove" aria-label={'Quitar '+item.name+' de la bandeja'} onClick={()=>shelfRemove(item)}><Trash2 size={14}/></button></div>)}</div>:<div className="shelf-empty"><span className="shelf-empty-icon"><Upload size={20}/></span><strong>Tu espacio para archivos</strong><small>Arrastrá archivos o carpetas para guardarlos acá</small></div>}</div>:notchPage==='weather'?<WeatherPanel active={hovered} native={nativeMode}/>:<section className="quick-modes" aria-label="Tus atajos rápidos"><div className="quick-modes-heading"><strong>Atajos rápidos</strong><button onClick={openModeSettings}>{actions.items.length?'Configurar':'Crear atajo'}</button></div>{actions.items.length?<div className="quick-modes-list">{actions.items.map(item=><button key={item.id} className="quick-mode" disabled={actions.busy||!!apps.pending||!!runningMode} onClick={()=>runMode(item)}><span className="quick-mode-icon"><Zap size={15}/></span><span><strong>{item.name}</strong><small>{runningMode===item.id?'Abriendo…':`${item.actions.length} ${item.actions.length===1?'acción':'acciones'}`}</small></span><Play size={13}/></button>)}</div>:<div className="quick-modes-empty"><Zap size={20}/><span>Creá un modo para abrir tus apps, páginas y carpetas con un clic.</span></div>}{modeResult&&<div className={'quick-mode-result '+(modeResult.results.some(step=>!step.ok)?'has-error':'')} role="status"><strong>{modeResult.results.filter(step=>step.ok).length}/{modeResult.results.length} aperturas solicitadas</strong>{modeResult.results.filter(step=>!step.ok).map((step,i)=><span key={i}>{step.name}: {step.detail}</span>)}</div>}{actions.error&&<p className="quick-mode-error" role="alert">{actions.error}</p>}</section>}</div>
      <button className="notch-settings-button" aria-label="Abrir ajustes" title="Ajustes" onClick={openQuickSettings}><Settings size={15}/></button>
      <button className="player-menu-arrow player-menu-left" aria-label="Vista anterior" onClick={()=>changeNotchPage(-1)}><ChevronLeft size={16}/></button><button className="player-menu-arrow player-menu-right" aria-label="Vista siguiente" onClick={()=>changeNotchPage(1)}><ChevronRight size={16}/></button>
      <nav className="notch-pagination" aria-label="Vistas del notch">{[['music','Música'],['shelf','Archivos'],['modes','Atajos rápidos'],['weather','Clima']].map(([id,label])=><button key={id} aria-label={label} title={label} aria-current={notchPage===id?'page':undefined} onClick={()=>navigateNotch(id)}/>)}</nav>
    </section>}
    {expanded&&tab==='quick-settings'&&<section className="quick-shell" inert={drop.active?true:undefined}><QuickSettings theme={theme} setTheme={setTheme} color={bimuColor} setColor={setBimuColor} opacity={opacity} setOpacity={setOpacity} clock={clock} statusIcon={statusIcon} onClose={collapse} onAdvanced={()=>{setSettingsInitial('app');setTab('settings')}}/></section>}
    {expanded&&tab==='settings'&&<section className="glass-shell" inert={drop.active?true:undefined} aria-label="Ajustes avanzados"><header className="hub-header"><IconButton title="Volver a ajustes" onClick={()=>setTab('quick-settings')}><ChevronLeft size={16}/></IconButton><strong>Ajustes avanzados</strong><IconButton title="Volver al notch" onClick={collapse}><X size={16}/></IconButton></header><div className="hub-body"><SettingsPanels dock={dock} setHovered={setHovered} config={config} onConfig={onConfig} pinned={pinned} setPinned={setPinned} safe={safe} apps={apps} actions={actions} startup={startup} avoidOverlap={avoidOverlap} setAvoidOverlap={setAvoidOverlap} initialSection={settingsInitial}/></div></section>}
    {error&&<div className="desktop-error" role="alert"><span>{error}</span><IconButton title="Cerrar aviso" onClick={()=>setError('')}><X size={14}/></IconButton></div>}
  </>
}


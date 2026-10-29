import React,{useState,useEffect} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {listen} from '@tauri-apps/api/event'
import {version} from '../package.json'
export function NativeServices({native,updateBusy}){
 const [channel,setChannel]=useState(null)
 useEffect(()=>{if(native)invoke('updates_channel').then(setChannel).catch(()=>setChannel('unknown'))},[native])
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[update,setUpdate]=useState(null),[progress,setProgress]=useState(0)
 useEffect(()=>{if(!native)return;let gone=false,off;listen('update-progress',e=>{if(!gone)setProgress(e.payload)}).then(fn=>{if(gone)fn();else off=fn}).catch(()=>{});return()=>{gone=true;off?.()}},[native])
 const run=async(label,fn)=>{if(busy)return;setBusy(label);setError('');try{await fn()}catch(e){setError(String(e.message||e))}finally{setBusy('')}}
 return <section className="native-services glass-card"><h2>Actualizaciones de Bimu</h2><p>Versión instalada: {version}</p>{!native?<p>La búsqueda de actualizaciones está disponible en la aplicación de escritorio.</p>:channel==='store'?<p>Las actualizaciones de esta versión se gestionan desde Microsoft Store.</p>:channel!=='github'?<p>No se pudo determinar el origen de instalación.</p>:<><button disabled={!!busy} onClick={()=>run('Buscando actualizaciones…',async()=>setUpdate(await invoke('updates_check')))}>Buscar actualización</button>{update&&<p role="status">{update.available?'Disponible: '+update.available:'Estás al día con las versiones publicadas.'}</p>}{update?.available&&!update.downloaded&&<button disabled={!!busy} onClick={()=>run('Descargando actualización…',async()=>{setProgress(0);setUpdate(await invoke('updates_download'))})}>Descargar versión {update.available}</button>}{update?.downloaded&&<><p>Descarga verificada. Bimu se cerrará para abrir el instalador.</p><button disabled={!!busy||updateBusy} onClick={()=>run('Abriendo instalador…',()=>invoke('updates_install'))}>Cerrar Bimu e instalar</button></>}{busy.startsWith('Descargando')&&<progress value={progress} max={100} aria-label="Descarga de actualización"/>}{busy&&<p role="status">{busy}</p>}{error&&<p role="alert">{error}</p>}</>}</section>
}

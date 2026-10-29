import React,{useMemo,useState} from 'react'
import {Search,Plus,Check,AppWindow,RefreshCw} from 'lucide-react'
function AppRow({item,apps}){
 const [editing,setEditing]=useState(false),[name,setName]=useState(item.name),[remove,setRemove]=useState(false)
 const disabled=apps.busy||!!apps.pending
 return <div className="application-row"><div><strong>{item.name}</strong><small>{item.available?'Disponible':'No encontrada'} · {item.target}</small></div>{editing?<form onSubmit={async e=>{e.preventDefault();if(await apps.update(item.id,name,item.aliases,item.remember))setEditing(false)}}><input aria-label={'Nombre de '+item.name} value={name} maxLength={80} onChange={e=>setName(e.target.value)}/><button disabled={disabled||!name.trim()}>Guardar</button><button type="button" onClick={()=>setEditing(false)}>Cancelar</button></form>:<div><button disabled={disabled} onClick={()=>{setName(item.name);setEditing(true)}}>Editar nombre</button><button disabled={disabled} onClick={()=>setRemove(true)}>Quitar</button></div>}{remove&&<div><span>¿Quitar de la lista de Bimu?</span><button disabled={disabled} onClick={()=>apps.remove(item.id)}>Sí, quitar</button><button onClick={()=>setRemove(false)}>Cancelar</button></div>}</div>
}
const keyName=value=>(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
export function ApplicationSettings({apps}){
 const [query,setQuery]=useState('')
 const filtered=useMemo(()=>{const search=keyName(query);return apps.discovered.filter(item=>keyName(item.name).includes(search))},[apps.discovered,query])
 const isAdded=item=>apps.items.some(existing=>existing.available&&(existing.id===item.id||[existing.name,...existing.aliases].some(name=>keyName(name)===keyName(item.name))))
 return <section className="application-settings glass-card" aria-label="Aplicaciones para atajos">
  <h2>Aplicaciones para atajos</h2><p>Elegí aplicaciones detectadas por Windows para usarlas en tus atajos.</p>
  {apps.error&&<p role="alert" className="ollama-error">{apps.error}</p>}
  <div className="applications-discovery-heading"><strong>Disponibles en tu PC</strong><button type="button" disabled={apps.discovering} onClick={()=>apps.discover(true)} title="Volver a buscar" aria-label="Volver a buscar aplicaciones"><RefreshCw size={14}/></button></div>
  <label className="applications-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar una aplicación" aria-label="Buscar aplicaciones detectadas"/></label>
  <div className="applications-discovery-list" aria-label="Aplicaciones detectadas" aria-busy={apps.discovering}>
   {apps.discovering&&!apps.discoveryLoaded?<p className="applications-empty">Buscando aplicaciones en Windows…</p>:!filtered.length?<p className="applications-empty">{query?'No encontramos aplicaciones con ese nombre.':'No encontramos aplicaciones. Podés registrar un .exe manualmente.'}</p>:filtered.map(item=>{const added=isAdded(item);return <div className="discovered-app" key={item.id}><span className="discovered-app-icon"><AppWindow size={15}/></span><strong title={item.name}>{item.name}</strong><button type="button" disabled={added||apps.busy||!!apps.pending} onClick={()=>apps.addDiscovered(item.id)} aria-label={(added?'Ya agregada: ':'Agregar ')+item.name}>{added?<><Check size={13}/> Agregada</>:<><Plus size={14}/> Agregar</>}</button></div>})}
  </div>
  <div className="application-toolbar"><button disabled={apps.busy||!!apps.pending} onClick={apps.add}>Registrar otra aplicación .exe</button><button disabled={apps.busy} onClick={apps.refresh}>Actualizar disponibilidad</button></div>
  <h3 className="registered-applications-heading">Agregadas a Bimu <span>{apps.items.length}</span></h3>
  {apps.items.map(item=><AppRow key={item.id} item={item} apps={apps}/>)}
 </section>
}

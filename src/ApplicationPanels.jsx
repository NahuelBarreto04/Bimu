import React,{useState} from 'react'
function AppRow({item,apps}){
 const [editing,setEditing]=useState(false),[name,setName]=useState(item.name),[remove,setRemove]=useState(false)
 const disabled=apps.busy||!!apps.pending
 return <div className="application-row"><div><strong>{item.name}</strong><small>{item.available?'Disponible':'No encontrada'} · {item.target}</small></div>{editing?<form onSubmit={async e=>{e.preventDefault();if(await apps.update(item.id,name,item.aliases,item.remember))setEditing(false)}}><input aria-label={'Nombre de '+item.name} value={name} maxLength={80} onChange={e=>setName(e.target.value)}/><button disabled={disabled||!name.trim()}>Guardar</button><button type="button" onClick={()=>setEditing(false)}>Cancelar</button></form>:<div><button disabled={disabled} onClick={()=>{setName(item.name);setEditing(true)}}>Editar nombre</button><button disabled={disabled} onClick={()=>setRemove(true)}>Quitar</button></div>}{remove&&<div><span>¿Quitar de la lista de Bimu?</span><button disabled={disabled} onClick={()=>apps.remove(item.id)}>Sí, quitar</button><button onClick={()=>setRemove(false)}>Cancelar</button></div>}</div>
}
export function ApplicationSettings({apps}){
 return <section className="application-settings glass-card" aria-label="Aplicaciones para atajos"><h2>Aplicaciones para atajos</h2><p>Agregá las aplicaciones que quieras usar al crear tus atajos.</p><div className="application-toolbar"><button disabled={apps.busy||!!apps.pending} onClick={apps.add}>Registrar otra aplicación .exe</button><button disabled={apps.busy} onClick={apps.refresh}>Actualizar disponibilidad</button></div>{apps.error&&<p role="alert" className="ollama-error">{apps.error}</p>}{apps.items.map(item=><AppRow key={item.id} item={item} apps={apps}/>)}</section>
}

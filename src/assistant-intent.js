export const normalizeAction=text=>String(text).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim()
export function folderRequest(text){
 if(String(text).length>512)return null
 const n=normalizeAction(text).replace(/^(?:hola )?bimu /,'').replace(/^por favor /,'')
 const match=n.match(/^(?:busca|buscame|buscar|encontra|encontrame) (?:una carpeta llamada |la carpeta llamada |una carpeta de nombre |la carpeta de nombre |una carpeta |la carpeta |carpeta )(.+)$/)
 if(!match)return null
 let name=match[1].replace(/ por favor$/,'');const open=/ y (?:abrila|abrela|abrimela|abri la carpeta|abrirla)$/.test(name)
 name=name.replace(/ y (?:abrila|abrela|abrimela|abri la carpeta|abrirla)$/,'').replace(/ en (?:mi pc|mi computadora|mi equipo|la pc)$/,'')
 return name&&name.length<=160?{name,open}:null
}
export function shortcutMatch(items,text){
 const n=normalizeAction(text).replace(/^(?:hola )?bimu /,'').replace(/^por favor /,'')
 const direct=n.replace(/^(?:abri|abre|abrir|abrime|inicia|iniciar|ejecuta) /,'').replace(/ por favor$/,'')
 return items.find(item=>[item.name,...item.aliases].some(name=>{const key=normalizeAction(name);return key===n||key===direct}))
}
export function shortcutSummary(result){const ok=result.results.filter(step=>step.ok).length;return `${result.name}: ${ok}/${result.results.length} aperturas solicitadas.${ok<result.results.length?' Algunas acciones no se pudieron completar.':''}`}

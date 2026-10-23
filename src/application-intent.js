export function looksLikeLaunch(text){
 const normalized=String(text).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim()
 return /^(?:(?:hola )?bimu )?(?:por favor )?(?:abri|abre|abrir|abrime|inicia|iniciar|ejecuta)\s+\S/.test(normalized)
}
const normalize=text=>String(text).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim()
export function registeredLaunch(items,text){
 if(String(text).length>512)return false
 const match=normalize(text).match(/^(?:(?:hola )?bimu )?(?:por favor )?(?:abri|abre|abrir|abrime|inicia|iniciar|ejecuta)\s+(?:(?:la aplicacion|el programa|la app) )?(.+?)(?: por favor)?$/)
 return !!match&&items.some(item=>[item.name,...item.aliases].some(name=>normalize(name)===match[1]))
}

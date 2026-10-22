export function looksLikeLaunch(text){
 const normalized=String(text).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim()
 return /^(?:(?:hola )?bimu )?(?:por favor )?(?:abri|abre|abrir|abrime|inicia|iniciar|ejecuta)\s+\S/.test(normalized)
}

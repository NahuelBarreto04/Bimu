export const ARM_WINDOW_MS=8000
export function wakeIntent(text,armed=false){
 const phrase=typeof text==='string'?text.trim():''
 const match=phrase.match(/^[¡¿\s]*(?:(?:hola|oye|hey|ey|che)\s+)?bimu(?![\p{L}\p{N}])[\s,.:;!?¿¡—-]*/iu)
 if(!match&&!armed)return {kind:'ignore'}
 const command=(match?phrase.slice(match[0].length):phrase).trim()
 if(!command)return {kind:'arm'}
 const normalized=command.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N} ]/gu,'').trim()
 if(['cancelar','cancela','cancelalo','olvidalo','nada'].includes(normalized))return {kind:'cancel'}
 return {kind:'request',text:command}
}

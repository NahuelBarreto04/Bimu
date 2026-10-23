export async function routeAssistantRequest(text,{apps,ai,voice=false,onAccepted,onShowChat,onFeedback}){
 if(apps.isCommand(text)){
  await ai.resetTools?.()
  const handled=await apps.request(text,{silent:voice,onFeedback})
  if(handled){if(handled!=='error')onAccepted?.();return handled!=='error'}
 }
 if(voice&&(!ai.connected||!ai.model)){onFeedback?.('error','Conectá Ollama y elegí un modelo para hacer consultas y buscar aplicaciones.');return false}
 if(voice){onShowChat?.();onFeedback?.('idle','Estoy pensando…')}
 const ok=await ai.send(text,onAccepted)
 if(voice)onFeedback?.(ok?'success':'error',ok?'La respuesta está en el chat.':'No pude completar el pedido. Revisá el aviso del chat.')
 return ok
}

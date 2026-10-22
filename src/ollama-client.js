import {invoke,Channel} from '@tauri-apps/api/core'
export function createOllamaClient(call=invoke,makeChannel=()=>new Channel()){
  return {
    async models(){const result=await call('ollama_models');if(!Array.isArray(result)||result.some(x=>typeof x!=='string'))throw new Error('Lista de modelos inválida.');return result},
    capabilities:model=>call('ollama_capabilities',{model}),
    chooseFolder:()=>call('workspace_choose'),
    revokeFolder:()=>call('workspace_revoke'),
    acceptDrop:id=>call('workspace_accept_drop',{id}),
    async stream(requestId,model,messages,onDelta,onTool=()=>{},useWorkspace=false){
      const channel=makeChannel()
      channel.onmessage=event=>{if(event?.type==='delta'&&typeof event.content==='string')onDelta(event.content);if(event?.type==='tool'&&['list_files','read_file'].includes(event.name)&&typeof event.path==='string'&&['running','done','error'].includes(event.status))onTool(event)}
      const result=await call('ollama_chat_stream',{requestId,model,messages,onEvent:channel,useWorkspace})
      if(typeof result?.content!=='string'||typeof result.stopped!=='boolean'||(!result.stopped&&!result.content.trim()))throw new Error('El modelo devolvió una respuesta inválida o vacía.')
      return result
    },
    cancel:requestId=>call('ollama_cancel',{requestId}),
    async chat(model,messages){const result=await call('ollama_chat',{model,messages});if(typeof result!=='string'||!result.trim())throw new Error('El modelo devolvió una respuesta vacía.');return result}
  }
}

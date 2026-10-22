import {invoke} from '@tauri-apps/api/core'
export function createOllamaClient(call=invoke){
  return {
    async models(){const result=await call('ollama_models');if(!Array.isArray(result)||result.some(x=>typeof x!=='string'))throw new Error('Lista de modelos inválida.');return result},
    async chat(model,messages){const result=await call('ollama_chat',{model,messages});if(typeof result!=='string'||!result.trim())throw new Error('El modelo devolvió una respuesta vacía.');return result}
  }
}

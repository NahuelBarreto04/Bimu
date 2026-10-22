import React,{useState} from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
function textOf(node){return typeof node==='string'?node:Array.isArray(node)?node.map(textOf).join(''):node?.props?textOf(node.props.children):''}
function CodeBlock({children}){
  const [status,setStatus]=useState('Copiar')
  const code=React.Children.toArray(children)[0]
  const language=code?.props?.className?.replace('language-','')||'Código'
  const copy=async()=>{try{await navigator.clipboard.writeText(textOf(children).replace(/\n$/,''));setStatus('Copiado')}catch{setStatus('No se pudo copiar')}}
  return <div className="code-block"><div><span>{language}</span><button type="button" onClick={copy}>{status}</button></div><pre>{children}</pre></div>
}
export function MessageContent({content,markdown}){
  return markdown?<div className="message-markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{pre:CodeBlock,a:({children})=><span className="message-link">{children}</span>,img:({alt})=><span>{alt}</span>}}>{content}</Markdown></div>:<p>{content}</p>
}

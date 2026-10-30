import 'server-only'
import Link from 'next/link'
import {Fragment,type ReactNode} from 'react'
import {wossInstructions} from '@/lib/woss-instructions'
import './woss-instructions.css'

function inline(text:string):ReactNode[]{
 return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part,index)=>part.startsWith('**')&&part.endsWith('**')?<strong key={index}>{part.slice(2,-2)}</strong>:part.startsWith('`')&&part.endsWith('`')?<code key={index}>{part.slice(1,-1)}</code>:<Fragment key={index}>{part}</Fragment>)
}
function content(text:string){
 return text.split(/\n\s*\n/).filter(Boolean).map((block,index)=>{
  const lines=block.split('\n')
  if(lines.every(line=>line.startsWith('|'))&&lines.length>2){
   const cells=(line:string)=>line.split('|').slice(1,-1).map(cell=>cell.trim())
   return <div className="woss-manual-table" key={index}><table><thead><tr>{cells(lines[0]).map((cell,key)=><th scope="col" key={key}>{inline(cell)}</th>)}</tr></thead><tbody>{lines.slice(2).map((line,row)=><tr key={row}>{cells(line).map((cell,key)=><td key={key}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>
  }
  if(lines.every(line=>line.startsWith('- ')))return <ul key={index}>{lines.map((line,key)=><li key={key}>{inline(line.slice(2))}</li>)}</ul>
  if(lines.every(line=>/^\d+\. /.test(line)))return <ol key={index}>{lines.map((line,key)=><li key={key}>{inline(line.replace(/^\d+\. /,''))}</li>)}</ol>
  return <p key={index}>{inline(lines.join('\n'))}</p>
 })
}
export default function WossInstructions(){
 const manual=wossInstructions
 if(!manual)return <div className="op-workspace woss-manual"><header className="op-page-heading"><h1>Instrucciones WOSS</h1></header><div className="op-card"><h2>Documento no disponible</h2><p>La configuración privada de esta versión está pendiente. No se muestra un mandato incompleto.</p><Link href="/equipo/trabajo" className="op-button">Volver a Trabajo</Link></div></div>
 return <div className="op-workspace woss-manual">
  <header className="op-page-heading"><div><p className="op-eyebrow">ANTUARIO / DIRECCIÓN</p><h1>Instrucciones WOSS</h1><p className="woss-manual-caption">Mandato completo · 20 de octubre de 2026</p></div><Link href="/equipo/trabajo" className="op-button">Volver a Trabajo</Link></header>
  <div className="woss-manual-layout">
   <nav className="op-card woss-manual-index" aria-label="Secciones del mandato"><h2>Índice</h2>{manual.sections.map(section=><a key={section.id} href={`#${section.id}`}>{section.title}</a>)}</nav>
   <article className="woss-manual-document">
    <header className="op-card woss-manual-intro"><p className="op-eyebrow">VERSIÓN {manual.updatedAt} · SOLO LECTURA</p><h2>{manual.title}</h2>{content(manual.introduction)}</header>
    {manual.sections.map(section=><section className="op-card woss-manual-section" key={section.id} id={section.id} aria-labelledby={`${section.id}-titulo`}><h2 id={`${section.id}-titulo`}>{section.title}</h2>{content(section.body)}</section>)}
   </article>
  </div>
 </div>
}

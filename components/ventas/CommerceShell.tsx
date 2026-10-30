'use client'
import './commerce.css'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {useRef,type ReactNode} from 'react'
import gsap from 'gsap'
import {useGSAP} from '@gsap/react'
import WosScene from '@/components/workspace/WosScene'
import type {WosVariant} from '@/lib/wos-assets'
gsap.registerPlugin(useGSAP)
type Metric={label:string;value:ReactNode;note?:string}
const links=[['/ventas/vision','Resumen'],['/ventas/propuestas','Propuestas'],['/ventas/contactos','Contactos'],['/ventas/crm','Pipeline'],['/ventas/reuniones','Agenda']]
export default function CommerceShell({title,variant,metrics,actions,children,note}:{title:string;variant:WosVariant;metrics:Metric[];actions?:ReactNode;children:ReactNode;note?:string}){
 const root=useRef<HTMLDivElement>(null),path=usePathname()
 useGSAP(()=>{const media=gsap.matchMedia();media.add('(prefers-reduced-motion: no-preference)',()=>{gsap.from('.commerce-heading,.commerce-hero,.commerce-navigation',{y:9,opacity:0,duration:.35,stagger:.04,ease:'power3.out',clearProps:'all'})});return()=>media.revert()},{scope:root})
 return <div ref={root} className={`op-workspace commerce-shell commerce-${variant}`}><header className="op-page-heading commerce-heading"><div><p className="op-eyebrow">ANTUARIO / VENTAS</p><h1>{title}</h1></div><div className="commerce-heading-actions">{actions}</div></header><nav className="commerce-navigation" aria-label="Espacio comercial">{links.map(([href,label])=><Link href={href} key={href} aria-current={path===href?'page':undefined}>{label}</Link>)}</nav><section className="op-card commerce-hero"><div className="commerce-hero-data"><span className="op-eyebrow">RESUMEN / {title.toUpperCase()}</span><div className="commerce-hero-metrics">{metrics.map(m=><div key={m.label}><span>{m.label}</span><strong>{m.value}</strong>{m.note&&<small>{m.note}</small>}</div>)}</div>{note&&<p className="op-footnote">{note}</p>}</div><WosScene className="commerce-hero-wos" variant={variant}/></section><div className="commerce-content">{children}</div></div>
}

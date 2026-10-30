'use client'
import Link from 'next/link'
import Image from 'next/image'
import {useRef} from 'react'
import {usePathname} from 'next/navigation'
import gsap from 'gsap'
import {useGSAP} from '@gsap/react'
import {useTheme} from '@/providers/ThemeProvider'
import {workspaceNavigation,overviewNavigation} from '@/lib/workspace-navigation'
import './sidebar-theme.css'
gsap.registerPlugin(useGSAP)
type Props={orgName:string|null;orgId:number;logoSignedUrl:string|null;mobileOpen?:boolean;onClose?:()=>void;collapsed?:boolean;onToggleCollapse?:()=>void;capabilities?:Record<string,boolean>}
export default function Sidebar({orgName,mobileOpen,onClose,collapsed,onToggleCollapse,capabilities}:Props){
 const pathname=usePathname(),{theme,toggleTheme}=useTheme(),root=useRef<HTMLElement>(null)
 useGSAP(()=>{const mm=gsap.matchMedia();mm.add('(prefers-reduced-motion: no-preference)',()=>{gsap.from('.op-nav-link',{x:-6,opacity:0,duration:.35,stagger:.016,clearProps:'all'});const glow=gsap.to('.sidebar-ambient',{y:35,x:10,duration:9,repeat:-1,yoyo:true,ease:'sine.inOut'});const visibility=()=>document.hidden?glow.pause():glow.resume();document.addEventListener('visibilitychange',visibility);return()=>document.removeEventListener('visibilitychange',visibility)});return()=>mm.revert()},{scope:root})
 const navigation=pathname==='/dashboard'&&!capabilities?.scopedProduction?overviewNavigation(capabilities):workspaceNavigation(capabilities)
 const link=(href:string,label:string,icon?:string)=><Link key={href} href={href} onClick={onClose} title={collapsed?label:undefined} aria-current={pathname===href?'page':undefined} className={`op-nav-link ${pathname===href?'op-nav-active':''}`}><span className="sidebar-icon" aria-hidden="true">{icon??'·'}</span>{!collapsed&&<span>{label}</span>}</Link>
 return <aside ref={root} className={`op-sidebar ${collapsed?'op-sidebar-compact':''} ${mobileOpen?'op-sidebar-open':''}`}><div className="sidebar-ambient" aria-hidden="true"/><Link href={capabilities?.scopedProduction?'/proyectos':'/dashboard'} className="op-sidebar-brand" aria-label={collapsed?"Antuario · Visión general":"Antuario · Espacio de trabajo · Visión general · Amor y paz"} onClick={onClose}><span className="op-isotype"><Image src="/brand/isotipo.svg" alt="Isotipo de Antuario" width={92} height={72} priority/></span>{!collapsed&&<span className="sidebar-brand-caption"><strong>ANTUARIO</strong><small>Espacio de trabajo</small></span>}{!collapsed&&<span className="sidebar-peace-mark sidebar-peace-header" role="img" aria-label="Amor y paz">☮</span>}</Link><nav aria-label="Áreas de Antuario">{navigation.map(section=>section.label?<section className="sidebar-area" key={section.key}>{!collapsed&&<p>{section.label}</p>}{section.links.map(item=>link(item.href,item.label,item.icon))}</section>:section.links.map(item=>link(item.href,item.label,item.icon)))}</nav><footer className="op-sidebar-footer">{!capabilities?.scopedProduction&&link('/configuracion/integraciones','Fuentes de datos','⌁')}<button className="op-nav-link" onClick={toggleTheme} title={theme==='light'?'Modo oscuro':'Modo claro'}><span className="sidebar-icon">{theme==='light'?'◐':'☀'}</span>{!collapsed&&(theme==='light'?'Modo oscuro':'Modo claro')}</button><button className="op-sidebar-collapse" aria-label={collapsed?'Expandir menú':'Contraer menú'} onClick={onToggleCollapse}>{collapsed?'→':'←'}{!collapsed&&' Contraer'}</button><div className="sidebar-signature">{collapsed&&<span className="sidebar-peace-mark" role="img" aria-label="Amor y paz">☮</span>}{!collapsed&&<small className="sidebar-org-name">{orgName??'Antuario'} · interno</small>}</div></footer></aside>
}

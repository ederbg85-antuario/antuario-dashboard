import Link from 'next/link'
import {teamSectionLinks,TEAM_WORK_PATH} from '@/lib/workspace-navigation'
import './team-section-nav.css'

export default function TeamSectionNav({current,showPerformance}:{current:'work'|'performance';showPerformance:boolean}){
 const active=current==='work'?TEAM_WORK_PATH:'/equipo'
 return <nav className="team-section-nav" aria-label="Vistas de Equipo">
  {teamSectionLinks(showPerformance).map(item=><Link key={item.href} href={item.href} aria-current={item.href===active?'page':undefined} className={item.href===active?'team-section-nav-active':''}>{item.label}</Link>)}
 </nav>
}

'use client'
import Link from 'next/link'
import type {OpsData} from '@/lib/operations-types'
import {areaLabels,type Area} from '@/lib/team-access'
import WosScene from './WosScene'
export default function AreaSummary({data,area,items}:{data:OpsData;area:Area;items:{label:string;value:string;note?:string}[]}){
 const members=data.team.filter(m=>m.status==='active'&&(area==='people'||m.areas.includes(area)))
 return <section className="op-card workspace-area-summary" data-enter><div className="workspace-area-data"><header><span className="op-eyebrow">RESUMEN / {areaLabels[area].toUpperCase()}</span><Link href="/equipo">Equipo ↗</Link></header><div className="workspace-area-metrics">{items.map(item=><div key={item.label}><span>{item.label}</span><strong>{item.value}</strong>{item.note&&<small>{item.note}</small>}</div>)}</div><div className="workspace-area-team"><span className="member-avatar-stack">{members.slice(0,5).map(m=><i key={m.id} title={m.name}>{m.name[0]}</i>)}</span><span>{members.length} integrantes · WOSS supervisa</span></div></div><WosScene className="workspace-area-character" variant={area}/></section>
}

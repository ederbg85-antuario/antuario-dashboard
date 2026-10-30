'use client'
import {useSyncExternalStore} from 'react'
import type {ReactNode} from 'react'
const subscribe=(onChange:()=>void)=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');media.addEventListener('change',onChange);return()=>media.removeEventListener('change',onChange)}
export function useChartAnimation(){return useSyncExternalStore(subscribe,()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches,()=>false)}
export const chartTick={fill:'var(--text-2)',fontSize:11}
export const chartTooltip={background:'var(--card)',color:'var(--text-1)',border:'none',borderRadius:16,boxShadow:'0 10px 40px #100c2320',fontSize:12,padding:'12px 16px'}
export function ChartPanel({title,kicker,source,action,children,table,className=''}:{title:string;kicker?:string;source:string;action?:ReactNode;children:ReactNode;table?:{headers:string[];rows:(string|number)[][]};className?:string}){
 return <article className={`op-card command-chart ${className}`} data-enter><header className="command-chart-heading"><div>{kicker&&<span className="op-eyebrow">{kicker}</span>}<h2>{title}</h2></div>{action}</header>{children}<footer className="chart-source"><span>{source}</span>{table&&<details><summary>Ver datos</summary><div className="chart-data-table"><table><thead><tr>{table.headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{table.rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table></div></details>}</footer></article>
}

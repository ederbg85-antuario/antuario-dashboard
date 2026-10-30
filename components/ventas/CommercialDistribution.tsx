'use client'
import {ResponsiveContainer,BarChart,Bar,XAxis,YAxis,Tooltip} from 'recharts'
import {ChartPanel,chartTick,chartTooltip,useChartAnimation} from '@/components/workspace/ChartPanel'
export default function CommercialDistribution({title,rows,note}:{title:string;rows:{name:string;value:number}[];note:string}){
 const animate=useChartAnimation()
 return <ChartPanel title={title} source={note} table={{headers:['Etapa','Registros'],rows:rows.map(r=>[r.name,r.value])}}><div className="commercial-distribution-canvas" style={{height:Math.max(180,rows.length*27+35)}}><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{width:500,height:180}}><BarChart data={rows} layout="vertical" margin={{top:8,left:0,right:15,bottom:0}} barSize={17}><XAxis type="number" allowDecimals={false} tick={chartTick} tickLine={false} axisLine={false}/><YAxis type="category" dataKey="name" tick={chartTick} tickLine={false} axisLine={false} interval={0} width={108}/><Tooltip contentStyle={chartTooltip} cursor={{fill:'var(--card-2)'}}/><Bar name="Registros" dataKey="value" fill="var(--chart-pending)" radius={[0,5,5,0]} isAnimationActive={animate} animationDuration={550}/></BarChart></ResponsiveContainer></div></ChartPanel>
}

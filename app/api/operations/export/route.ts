import {NextRequest,NextResponse} from 'next/server'
import {workspace} from '@/lib/workspace'
import {financeSummary} from '@/lib/finance'
export async function GET(req:NextRequest){
 const context=await workspace()
 if(!context||context.role!=='owner')return NextResponse.json({error:'Sin permisos'},{status:403})
 const month=req.nextUrl.searchParams.get('month')??new Date().toISOString().slice(0,7)
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return NextResponse.json({error:'Periodo inválido'},{status:400})
 const [{data:entries,error:e1},{data:documents,error:e2},{data:closings,error:e3},{data:accounts,error:e4}]=await Promise.all(['finance_entries','finance_documents','finance_closings','finance_accounts'].map(t=>context.db.from(t).select('*').eq('organization_id',context.orgId).limit(10000)))
 if(e1||e2||e3||e4)return NextResponse.json({error:'No se pudieron cargar los registros'},{status:503})
 const escape=(value:unknown)=>{let v=String(value??'');if(/^[\s\u0000-\u001f]*[=+@\-]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'}
 let rows:unknown[][]
 if(req.nextUrl.searchParams.get('type')==='results'){
 const s=financeSummary({entries:entries??[],documents:documents??[],closings:closings??[],accounts:accounts??[]},month)
 rows=[['Periodo',month],['Moneda','MXN'],['Cobertura',s.complete?'Ingresos y costos marcados completos':'PARCIAL; no hay utilidad definitiva'],['Criterio','Igualas por día de servicio; ingresos sin IVA; no sustituye auditoría SAT'],['Ingresos registrados',s.revenue],['Costo directo',s.cogs],['Gasto operativo',s.opex],['Utilidad bruta',s.gross??'POR CONFIRMAR'],['EBITDA',s.ebitda??'POR CONFIRMAR'],['Depreciación / amortización',s.depreciation],['Intereses',s.interest],['Impuesto a utilidad',s.tax],['Utilidad neta',s.net??'POR CONFIRMAR'],['Margen bruto %',s.grossMargin??'N/D'],['Margen EBITDA %',s.ebitdaMargin??'N/D'],['Margen neto %',s.netMargin??'N/D']]
 }else rows=[['Título','Dirección','Categoría','Fecha caja','Fecha devengo','Moneda','Depósito/pago','Subtotal','IVA','Retenciones','Evidencia','Fuente'],...(entries??[]).filter(e=>e.cash_date?.slice(0,7)===month).map(e=>[e.title,e.direction,e.category,e.cash_date,e.recognition_date,e.currency,e.cash_amount,e.subtotal,e.vat,e.retention,e.evidence,e.source])]
 const csv='\uFEFF'+rows.map(r=>r.map(escape).join(',')).join('\r\n')
 return new NextResponse(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="antuario-${month}-${req.nextUrl.searchParams.get('type')==='results'?'resultados':'movimientos'}.csv"`,'Cache-Control':'private, no-store'}})
}

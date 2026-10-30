import {useEffect,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {FinancialPrivacyProvider} from '../../components/privacy/FinancialPrivacy'
import OperationalCalendar from '../../components/operations/OperationalCalendar'
import {AccountExistingWork} from '../../components/accounts/AccountExistingWork'
import type {OpsData} from '../../lib/operations-types'
import type {AccountBundle} from '../../lib/client-accounts-types'
function Preview(){
 const [data,setData]=useState<{ops:OpsData;bundle:AccountBundle}|null>(null),[mode,setMode]=useState('calendar')
 useEffect(()=>{const load=()=>{fetch('/_fixture/data').then(r=>r.json()).then(setData)};load();window.addEventListener('fixture-refresh',load);return()=>window.removeEventListener('fixture-refresh',load)},[])
 return <main className="op-workspace" style={{maxWidth:1450,margin:'0 auto',padding:24}}><p style={{fontSize:12,marginBottom:16,color:'var(--text-2)'}}>Laboratorio local · datos de prueba · sin conexión a producción</p><nav style={{display:'flex',gap:12,marginBottom:20}}><button className="op-button" onClick={()=>setMode('calendar')}>Calendario de prueba</button><button className="op-button" onClick={()=>setMode('account')}>Cuenta de prueba</button><button className="op-button" onClick={()=>document.documentElement.classList.toggle('dark')}>Tema</button></nav>{!data?<p>Cargando…</p>:mode==='calendar'?<OperationalCalendar data={data.ops}/>:<AccountExistingWork bundle={data.bundle}/>}</main>
}
createRoot(document.getElementById('root')!).render(<FinancialPrivacyProvider><Preview/></FinancialPrivacyProvider>);

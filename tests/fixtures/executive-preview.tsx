import {createRoot} from 'react-dom/client'
import {useEffect,useState} from 'react'
import DashboardShell from '../../components/layout/DashboardShell'
import OperationsClient from '../../components/operations/OperationsClient'
import {ThemeProvider} from '../../providers/ThemeProvider'
import {businessFixture} from '../helpers/business-fixture'
const data=businessFixture()
function Preview(){
 const [qa,setQa]=useState('')
 useEffect(()=>{const timer=setTimeout(async()=>{
  const params=new URLSearchParams(location.search)
  if(params.has('dark'))document.documentElement.classList.add('dark')
  const before=document.querySelector('.executive-score-finance .executive-score-value')?.textContent
  const toggle=document.querySelector<HTMLButtonElement>('[aria-label="Mostrar cifras financieras"]')
  const checked={initialHidden:before==='••••',width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,areas:[...document.querySelectorAll('.executive-score header>span')].map(n=>n.textContent),charts:document.querySelectorAll('.recharts-wrapper').length,mini:[...document.querySelectorAll('.executive-score-chart .recharts-wrapper')].map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,paths:n.querySelectorAll('path').length})),heading:document.querySelector('h1')?.getBoundingClientRect().top,scoreBottom:document.querySelector('.executive-scoreboard')?.getBoundingClientRect().bottom,errors:(window as unknown as {previewErrors?:string[]}).previewErrors??[]}
  if(params.has('show'))toggle?.click()
  if(params.has('qa')){
   toggle?.click();await new Promise(r=>setTimeout(r,150));const shown=document.querySelector('.executive-score-finance .executive-score-value')?.textContent
   document.querySelector<HTMLButtonElement>('[aria-label="Ocultar cifras financieras"]')?.click();await new Promise(r=>setTimeout(r,100));const hiddenAgain=document.querySelector('.executive-score-finance .executive-score-value')?.textContent
   document.querySelector<HTMLButtonElement>('.executive-marketing-controls button:nth-child(2)')?.click();await new Promise(r=>setTimeout(r,100));setQa(JSON.stringify({...checked,revealWorks:!!shown&&shown!=='••••',hideWorks:hiddenAgain==='••••',marketingSwitch:document.querySelector('.executive-marketing-controls button:nth-child(2)')?.getAttribute('aria-pressed')==='true'}))
  }else setQa(JSON.stringify(checked))
 },1200);return()=>clearTimeout(timer)},[])
 return <ThemeProvider><DashboardShell orgName="Antuario" orgId={1} logoSignedUrl={null} userName="Eder" avatarUrl={null} capabilities={data.capabilities}><OperationsClient view="overview" data={data}/><small style={{position:'fixed',right:16,bottom:8,fontSize:10,zIndex:100,background:'var(--card)',color:'var(--text-2)',padding:'3px 8px',borderRadius:4}}>Vista de prueba · datos simulados</small><output id="preview-qa" style={{display:'none'}}>{qa}</output></DashboardShell></ThemeProvider>
}
createRoot(document.getElementById('root')!).render(<Preview/>);

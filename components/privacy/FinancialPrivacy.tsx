'use client'
import {createContext,useContext,useState,type ReactNode} from 'react'
import {usePathname} from 'next/navigation'
import {formatAccountMoney} from '@/lib/client-account-money'
import {maskFinancialText,privateMoney} from '@/lib/financial-privacy'
import './financial-privacy.css'
const PrivacyContext=createContext({visible:false,toggle:()=>{}})
export function FinancialPrivacyProvider({children}:{children:ReactNode}){
 const pathname=usePathname()
 const [choice,setChoice]=useState({path:pathname,visible:false})
 const visible=choice.path===pathname&&choice.visible
 return <PrivacyContext.Provider value={{visible,toggle:()=>setChoice({path:pathname,visible:!visible})}}>{children}</PrivacyContext.Provider>
}
export function useFinancialPrivacy(){
 const context=useContext(PrivacyContext)
 return {...context,money:(value:number|null|undefined,currency='MXN')=>privateMoney(value,currency,context.visible),text:(value:string|null|undefined)=>context.visible?(value??''):maskFinancialText(value??'')}
}
export function FinancialPrivacyToggle(){
 const {visible,toggle}=useFinancialPrivacy()
 return <button type="button" className="financial-privacy-toggle" aria-label={visible?'Ocultar cifras financieras':'Mostrar cifras financieras'} aria-pressed={visible} onClick={toggle}><svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" stroke="currentColor" strokeWidth="1.3"/><circle cx="10" cy="10" r="2" stroke="currentColor" strokeWidth="1.3"/>{!visible&&<path d="m3 3 14 14" stroke="currentColor" strokeWidth="1.4"/>}</svg><span>{visible?'Ocultar importes':'Mostrar importes'}</span></button>
}
export function FinancialChart({children}:{children:ReactNode}){
 const {visible}=useFinancialPrivacy()
 return visible?<>{children}</>:<div className="financial-chart-private" role="status"><span aria-hidden="true">••••</span><p>Importes ocultos</p></div>
}
export function FinancialText({children}:{children:string|null|undefined}){
 const {text}=useFinancialPrivacy()
 return <>{text(children)}</>
}
export function FinancialValue({value,currency='MXN'}:{value:number|null|undefined;currency?:string}){
 const {visible}=useFinancialPrivacy()
 return <span aria-label={value==null?'Dato por confirmar':visible?undefined:'Importe oculto'}>{visible?formatAccountMoney(value,currency):value==null?'Por confirmar':'••••'}</span>
}

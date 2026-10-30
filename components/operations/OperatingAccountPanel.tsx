'use client'
import {useEffect,useRef} from 'react'
import dynamic from 'next/dynamic'
const AccountWorkspace=dynamic(()=>import('@/components/accounts/AccountsClient'),{loading:()=> <p role="status" className="operating-empty">Cargando cuenta…</p>})
export default function OperatingAccountPanel({accountId,name,close}:{accountId:string;name:string;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{const node=ref.current;node?.showModal();return()=>node?.close()},[])
 return <dialog ref={ref} className="operating-account-dialog" aria-label={`Cuenta ${name}`} onCancel={e=>{e.preventDefault();close()}}><header><div><span>CUENTAS / OPERACIÓN</span><h2>{name}</h2></div><button aria-label="Cerrar cuenta" onClick={close}>×</button></header><AccountWorkspace accountId={accountId} initialTab="operacion" embedded/></dialog>
}

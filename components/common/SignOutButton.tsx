'use client'
import {useState} from 'react'

export default function SignOutButton({compact=false}:{compact?:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(false)
 async function signOut(){
  if(busy)return
  setBusy(true);setError(false)
  try{
   // The auth SDK is only needed for this action, not for the initial dashboard render.
   const {createClient}=await import('@/lib/supabase/client')
   const {error}=await createClient().auth.signOut({scope:'local'})
   if(error)throw error
   window.location.replace('/login')
  }catch{setError(true);setBusy(false)}
 }
 return <div className="shrink-0"><button className="op-button" type="button" aria-label="Cerrar sesión" disabled={busy} onClick={signOut}>{compact?<><svg className="op-signout-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M10 5H5v14h5M13 8l4 4-4 4M8 12h9" strokeLinecap="round" strokeLinejoin="round"/></svg><span className="op-signout-label">{busy?'Saliendo…':'Salir'}</span></>:busy?'Saliendo…':'Cerrar sesión'}</button>{error&&<p role="alert" className="text-xs text-red-600">No se pudo cerrar. Inténtalo de nuevo.</p>}</div>
}

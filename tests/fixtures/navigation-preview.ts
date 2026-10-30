import {useEffect,useState} from 'react'
// One shared history subscription; mounting/unmounting nested views must not undo another view's listener.
const listeners=new Set<()=>void>()
let restore:(()=>void)|undefined
function subscribe(listener:()=>void){
 listeners.add(listener)
 if(listeners.size===1){const original=window.history.replaceState,originalPush=window.history.pushState;const notify=()=>{for(const current of listeners)current()};window.history.replaceState=function(...args){original.apply(this,args);notify()};window.history.pushState=function(...args){originalPush.apply(this,args);notify()};window.addEventListener('popstate',notify);restore=()=>{window.history.replaceState=original;window.history.pushState=originalPush;window.removeEventListener('popstate',notify)}}
 return()=>{listeners.delete(listener);if(!listeners.size){restore?.();restore=undefined}}
}
export function useSearchParams(){const [,render]=useState(0);useEffect(()=>subscribe(()=>render(n=>n+1)),[]);return new URLSearchParams(location.search)}
export function useRouter(){return {replace:(url:string)=>{history.replaceState(null,'',url);window.dispatchEvent(new Event('popstate'))},refresh:()=>window.dispatchEvent(new Event('fixture-refresh'))}}
export function usePathname(){return location.pathname}

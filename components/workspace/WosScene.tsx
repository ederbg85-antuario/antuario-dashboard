'use client'
import Image from 'next/image'
import {wosAsset,type WosVariant} from '@/lib/wos-assets'
import {useRef} from 'react'
import {useGSAP} from '@gsap/react'
import gsap from 'gsap'
gsap.registerPlugin(useGSAP)
/** The entire peace artwork fits inside the stage, including both hands. */
export default function WosScene({className='',variant='peace',motion=true,expressive=false}:{className?:string;variant?:WosVariant;motion?:boolean;expressive?:boolean}){
 const root=useRef<HTMLDivElement>(null)
 useGSAP(()=>{if(!motion)return;const media=gsap.matchMedia();media.add('(prefers-reduced-motion: no-preference)',()=>{
  const loop=gsap.timeline({paused:true,repeat:-1,yoyo:true,defaults:{duration:3.4,ease:'sine.inOut'}}).to('.wos-scene-character',{y:expressive?-11:-7,rotation:expressive?1.8:.7},0).to('.wos-scene-reflection',{scaleX:.82,opacity:.4},0).to('.wos-scene-orbit',{rotation:12,scale:1.06,opacity:.7},0)
  if(expressive)loop.to('.wos-scene-spark',{y:-9,rotation:22,scale:.8,opacity:.35,stagger:.5},0)
  let visible=false;const resume=()=>visible&&!document.hidden?loop.resume():loop.pause();const io=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;resume()});io.observe(root.current!);document.addEventListener('visibilitychange',resume)
  return()=>{io.disconnect();document.removeEventListener('visibilitychange',resume)}
 });return()=>media.revert()},{scope:root,dependencies:[motion,expressive],revertOnUpdate:true})
 return <div ref={root} className={`wos-scene ${className}`} aria-hidden="true"><div className="wos-scene-orbit"/><div className="wos-scene-reflection"/>{expressive&&<><span className="wos-scene-spark spark-one">✧</span><span className="wos-scene-spark spark-two">✦</span></>}<Image className="wos-scene-character" src={wosAsset(variant)} width={650} height={650} alt="" sizes="(max-width: 767px) 190px, 240px"/></div>
}

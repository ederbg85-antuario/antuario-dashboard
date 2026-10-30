// Isolated Chrome profile and synthetic local data only. Never reads a user's browser session.
import {spawn} from 'node:child_process'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
const output=path.resolve('docs/verification/executive-redesign-2026-10-28')
const profile=await mkdtemp(path.join(tmpdir(),'antuario-executive-qa-'))
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']})
const endpoint=await new Promise<string>((resolve,reject)=>{let log='';chrome.stderr.on('data',chunk=>{log+=chunk.toString();const match=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match)resolve(match[1])});chrome.on('exit',code=>reject(new Error('Chrome exited: '+code)));setTimeout(()=>reject(new Error('Chrome startup timed out')),15000).unref()})
const ws=new WebSocket(endpoint);await new Promise<void>((resolve,reject)=>{ws.addEventListener('open',()=>resolve());ws.addEventListener('error',()=>reject(new Error('Chrome connection failed')))})
let sequence=0;const pending=new Map<number,{resolve:(value:Record<string,unknown>)=>void;reject:(error:Error)=>void}>()
ws.addEventListener('message',event=>{const message=JSON.parse(String(event.data));if(message.id){const item=pending.get(message.id);pending.delete(message.id);if(message.error)item?.reject(new Error(message.error.message));else item?.resolve(message.result??{})}})
const call=(method:string,params:Record<string,unknown>={},sessionId?:string)=>new Promise<Record<string,unknown>>((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))})
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms)),evidence:Record<string,unknown>[]=[]
try{
 for(const viewport of [{name:'desktop',width:1440,height:1000,mobile:false},{name:'laptop',width:1280,height:549,mobile:false},{name:'mobile',width:390,height:844,mobile:true}]){
  const created=await call('Target.createTarget',{url:'about:blank'}),attached=await call('Target.attachToTarget',{targetId:created.targetId,flatten:true}),session=String(attached.sessionId)
  await call('Emulation.setDeviceMetricsOverride',{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:viewport.mobile},session)
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},session)
  await call('Page.enable',{},session);await call('Runtime.enable',{},session)
  await call('Page.navigate',{url:'http://127.0.0.1:4322/dashboard?mode=business&qa=1'},session)
  let qa='';for(let attempt=0;attempt<60;attempt++){await sleep(100);const value=await call('Runtime.evaluate',{expression:'document.querySelector("#preview-qa")?.textContent',returnByValue:true},session);qa=String((value.result as {value?:string})?.value??'');if(qa)break}
  if(!qa)throw new Error('Preview QA never completed: '+viewport.name)
  const checked=JSON.parse(qa)
  const extra=await call('Runtime.evaluate',{expression:'JSON.stringify({leftMenu: getComputedStyle(document.querySelector(".op-sidebar")).backgroundColor, titleSize:getComputedStyle(document.querySelector("h1")).fontSize, scoreSizes:[...document.querySelectorAll(".executive-score-value")].map(n=>getComputedStyle(n).fontSize), clipped:[...document.querySelectorAll(".executive-score")].filter(n=>n.scrollWidth>n.clientWidth).length, headerOverflow:document.querySelector(".op-topbar").scrollWidth>document.querySelector(".op-topbar").clientWidth})',returnByValue:true},session)
  evidence.push({viewport,...checked,...JSON.parse(String((extra.result as {value:string}).value))})
  const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},session);await writeFile(path.join(output,'business-'+viewport.name+'.png'),Buffer.from(String(screenshot.data),'base64'))
  // Reload must reset the visible financial choice. The provider has no persistent visible preference.
  await call('Runtime.evaluate',{expression:'document.querySelector("[aria-label=\\"Mostrar cifras financieras\\"]").click()'},session)
  await sleep(100);await call('Page.reload',{ignoreCache:true},session);await sleep(1800)
  const reloaded=await call('Runtime.evaluate',{expression:'document.querySelector(".executive-score-finance .executive-score-value")?.textContent',returnByValue:true},session)
  evidence[evidence.length-1].reloadHidden=(reloaded.result as {value?:string}).value==='••••'
  if(viewport.name==='desktop'){
   await call('Runtime.evaluate',{expression:'document.querySelector("main").scrollTop=document.querySelector("#business-sales").offsetTop-20'},session);await sleep(200)
   const detail=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},session);await writeFile(path.join(output,'business-detail.png'),Buffer.from(String(detail.data),'base64'))
   await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-color-scheme',value:'dark'}]},session)
   await call('Runtime.evaluate',{expression:'document.documentElement.classList.add("dark");document.querySelector("main").scrollTop=0'},session);await sleep(200)
   const dark=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},session);await writeFile(path.join(output,'dark.png'),Buffer.from(String(dark.data),'base64'))
  }
  await call('Page.navigate',{url:'http://127.0.0.1:4322/dashboard?operationCheck=1'},session);await sleep(1600)
  const op=await call('Runtime.evaluate',{expression:'JSON.stringify({wossWidth:document.querySelector(".operating-woss")?.getBoundingClientRect().width,surfaces:[...document.querySelectorAll(".operating-pulse,.operating-signal,.operating-agenda,.operating-status-chart,.operating-accounts")].map(n=>({border:getComputedStyle(n).borderTopWidth,shadow:getComputedStyle(n).boxShadow,radius:getComputedStyle(n).borderTopLeftRadius})),wossLoaded:!!document.querySelector(".operating-woss img")?.naturalWidth,pieSize:document.querySelector(".operating-status-ring")?.getBoundingClientRect().width,defaultTitle:document.querySelector(".operating-heading h1")?.textContent,visibleRows:[...document.querySelectorAll(".operating-task-row")].filter(n=>n.getBoundingClientRect().bottom<innerHeight).length,firstTask:document.querySelector(".operating-task-row")?.getBoundingClientRect().top,taskFont:getComputedStyle(document.querySelector(".operating-task-copy>strong")).fontSize,signalColors:[...document.querySelectorAll(".operating-signal")].map(n=>getComputedStyle(n).backgroundColor),pageOverflow:document.documentElement.scrollWidth>innerWidth,mainOverflow:document.querySelector("main").scrollWidth>document.querySelector("main").clientWidth})',returnByValue:true},session)
  evidence[evidence.length-1].operation=JSON.parse(String((op.result as {value:string}).value))
  const operationShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},session);await writeFile(path.join(output,viewport.name+'.png'),Buffer.from(String(operationShot.data),'base64'))
  const focusChecks=await call('Runtime.evaluate',{expression:`(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));document.querySelectorAll('.operating-pulse-actions button')[0].click();await wait(120);const reviewRows=[...document.querySelectorAll('.operating-task-row')];const review=reviewRows.length===3&&reviewRows.every(n=>n.textContent.includes('Revisión'));document.querySelectorAll('.operating-pulse-actions button')[1].click();await wait(100);const overdue=!!document.querySelector('.operating-empty');document.querySelectorAll('.operating-pulse-actions button')[2].click();await wait(100);const unassigned=!!document.querySelector('.operating-empty')&&document.querySelector('.operating-agenda h2').textContent==='Sin responsable';return {review,overdue,unassigned}})()`,awaitPromise:true,returnByValue:true},session)
  evidence[evidence.length-1].pulseActions=(focusChecks.result as {value:unknown}).value
  if(viewport.name==='desktop'){
   await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]},session)
   await sleep(150)
   const motion=await call('Runtime.evaluate',{expression:`(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));const art=document.querySelector('.operating-woss img');const initial=art.style.transform;await wait(500);const moving=art.style.transform!==initial;document.querySelector('.operating-motion-toggle').click();await wait(100);const stopped=art.style.transform;await wait(350);const paused=stopped===art.style.transform;const pressed=document.querySelector('.operating-motion-toggle').getAttribute('aria-pressed')==='true';document.querySelector('.operating-motion-toggle').click();await wait(100);const restarted=art.style.transform;await wait(400);return {moving,paused,pressed,resumed:art.style.transform!==restarted}})()`,awaitPromise:true,returnByValue:true},session)
   evidence[evidence.length-1].motion=(motion.result as {value:unknown}).value
   await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},session)
   const reduced=await call('Runtime.evaluate',{expression:`(async()=>{const art=document.querySelector('.operating-woss img');const initial=art.style.transform;await new Promise(r=>setTimeout(r,300));return art.style.transform===initial})()`,awaitPromise:true,returnByValue:true},session)
   evidence[evidence.length-1].reducedMotion=(reduced.result as {value:unknown}).value
  }
  await call('Runtime.evaluate',{expression:'document.querySelector(".operating-business-switch").click()'},session);await sleep(200)
  const businessMode=await call('Runtime.evaluate',{expression:'document.querySelectorAll(".executive-score").length',returnByValue:true},session)
  evidence[evidence.length-1].switchToBusiness=(businessMode.result as {value:number}).value===4
  await call('Runtime.evaluate',{expression:'document.querySelector(".antuario-home-modes button").click()'},session);await sleep(150)
  const back=await call('Runtime.evaluate',{expression:'!!document.querySelector(".operating-task-list")',returnByValue:true},session)
  evidence[evidence.length-1].backToOperation=(back.result as {value:boolean}).value
  await call('Target.closeTarget',{targetId:created.targetId})
 }
 await writeFile(path.join(output,'browser-checks.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2))
 if(evidence.some(e=>Object.values((e.pulseActions??{}) as Record<string,boolean>).some(v=>!v)||Object.values((e.motion??{}) as Record<string,boolean>).some(v=>!v)||e.reducedMotion===false||(e.operation as {wossWidth:number}).wossWidth<170||(e.operation as {surfaces:{border:string;shadow:string}[]}).surfaces.some(x=>x.border!=='0px'||x.shadow==='none')||e.overflow||e.headerOverflow||e.clipped||!e.initialHidden||!e.revealWorks||!e.hideWorks||!e.reloadHidden||!e.marketingSwitch||!e.switchToBusiness||!e.backToOperation||!(e.operation as {wossLoaded:boolean}).wossLoaded||(e.operation as {pieSize:number}).pieSize<196||(e.operation as {pageOverflow:boolean;mainOverflow:boolean}).pageOverflow||(e.operation as {mainOverflow:boolean}).mainOverflow||(e.errors as unknown[]).length))process.exitCode=1
}finally{ws.close();chrome.kill('SIGTERM');await sleep(300);await rm(profile,{recursive:true,force:true}).catch(()=>{})}

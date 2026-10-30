import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {jsPDF} from 'jspdf';
import {DocumentPreview} from '../components/operations/DeliveryReview';
import {asUser,createDeliveryDb,people,taskId} from './helpers/delivery-db-fixture';
import {deliveryRouteContext,loadDeliveryRoute} from './helpers/delivery-route-fixture';
import {MAX_DELIVERY_BYTES} from '../lib/task-deliveries';
type Upload={POST:(r:Request)=>Promise<Response>};
type Asset={GET:(r:Request,p:{params:Promise<{id:string;index:string}>})=>Promise<Response>};
const url='http://localhost:4324/api/operations/deliveries';
const payload='<?xml version="1.0" encoding="UTF-8"?>\r\n<?xml-stylesheet href="https://invalid.example/probe.xsl"?>\r\n<!DOCTYPE cfdi [<!ENTITY probe SYSTEM "file:///etc/passwd">]>\r\n<cfdi:Comprobante xmlns:cfdi="urn:fixture" Nombre="José &amp; Ana">&probe;<script>alert(1)</script></cfdi:Comprobante>\r\n';

test('original XML keeps UTF-8 bytes, BOM, CRLF and extension under existing private permissions',async()=>{
 const db=await createDeliveryDb(),fixture=deliveryRouteContext(db);
 try {
  await asUser(db,people.owner);
  const api=await loadDeliveryRoute<Upload>('app/api/operations/deliveries/route.ts',()=>fixture.context);
  const assets=await loadDeliveryRoute<Asset>('app/api/operations/deliveries/[id]/assets/[index]/route.ts',()=>fixture.context);
  const pdf=new jsPDF();pdf.text('Factura sintetica para prueba',20,20);const pdfBytes=Buffer.from(pdf.output('arraybuffer'));
  for(const [index,mime] of ['application/xml','text/xml','application/octet-stream','text/plain',''].entries()){
   const bytes=Buffer.from((index%2===0?'\uFEFF':'')+payload,'utf8'),form=new FormData();
   for(const[k,v]of Object.entries({task_id:taskId,request_key:crypto.randomUUID(),title:'XML original',summary:'',document:'',link:''}))form.set(k,v);
   form.set('files',new File([bytes],'factura-original.XML',{type:mime}));
   if(index===0)form.append('files',new File([pdfBytes],'factura-original.pdf',{type:'application/pdf'}));
   const response=await api.POST(new Request(url,{method:'POST',body:form}));
   assert.equal(response.status,201,await response.clone().text());
   const {id}=await response.json(),params={params:Promise.resolve({id,index:'0'})};
   const record=(await db.query<{artifacts:{name:string;format:string;text:string}[]}>('select artifacts from task_deliveries where id=$1',[id])).rows[0].artifacts[0];
   assert.equal(record.name,'factura-original.XML');assert.equal(record.format,'text');assert.deepEqual(Buffer.from(record.text,'utf8'),bytes);
   if(index===0){const pdfDownload=await assets.GET(new Request(url+'/'+id+'/assets/1?download=1'),{params:Promise.resolve({id,index:'1'})});assert.equal(pdfDownload.status,200);assert.deepEqual(Buffer.from(await pdfDownload.arrayBuffer()),pdfBytes,'PDF and XML coexist without changing either original');}
   for(const suffix of ['', '?download=1']){
    const downloaded=await assets.GET(new Request(url+'/'+id+'/assets/0'+suffix),params);
    assert.equal(downloaded.status,200);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);
    assert.equal(downloaded.headers.get('content-type'),'text/plain; charset=utf-8');
    assert.equal(downloaded.headers.get('x-content-type-options'),'nosniff');
    assert.match(downloaded.headers.get('content-security-policy')!,/default-src 'none'; sandbox/);
    assert.match(downloaded.headers.get('cache-control')!,/private, no-store/);
    assert.match(downloaded.headers.get('content-disposition')!,/filename="factura-original.XML"/);
    if(suffix)assert.match(downloaded.headers.get('content-disposition')!,/^attachment;/);
   }
   await asUser(db,people.otherClient);assert.equal((await assets.GET(new Request(url),params)).status,404);await asUser(db,people.owner);
  }
 } finally {await db.close()}
});

test('XML upload rejects incompatible MIME, invalid UTF-8, NUL, oversize documents and whole-delivery limits before persistence',async()=>{
 const db=await createDeliveryDb(),fixture=deliveryRouteContext(db);
 try {
  await asUser(db,people.owner);
  const api=await loadDeliveryRoute<Upload>('app/api/operations/deliveries/route.ts',()=>fixture.context);
  const cases:[File[],number][]=[
   [[new File([payload],'factura.xml',{type:'text/html'})],400],
   [[new File([new Uint8Array([0xff,0xfe,0x3c,0])],'factura.xml',{type:'application/xml'})],400],
   [[new File(['<x>\0</x>'],'factura.xml',{type:'application/xml'})],400],
   [[new File(['x'.repeat(64001)],'factura.xml',{type:'application/xml'})],400],
   [[new File(['x'.repeat(MAX_DELIVERY_BYTES+1)],'factura.xml',{type:'application/xml'})],413],
   [Array.from({length:9},(_,i)=>new File(['<x/>'],i+'.xml',{type:'application/xml'})),413],
  ];
  for(const[files,status]of cases){
   const form=new FormData();for(const[k,v]of Object.entries({task_id:taskId,request_key:crypto.randomUUID(),title:'XML',summary:'',document:'',link:''}))form.set(k,v);
   for(const file of files)form.append('files',file);
   assert.equal((await api.POST(new Request(url,{method:'POST',body:form}))).status,status);
  }
  assert.equal((await db.query('select * from task_deliveries')).rows.length,0);assert.equal(fixture.files.size,0);
 }finally{await db.close()}
});

test('XML preview escapes tags, external entities and XSL instructions as inert text',()=>{
 const html=renderToStaticMarkup(createElement(DocumentPreview,{artifact:{kind:'document',name:'factura.xml',format:'text',text:payload}}));
 assert.match(html,/^<pre /);assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.match(html,/&lt;!ENTITY probe SYSTEM/);assert.match(html,/&amp;probe;/);assert.match(html,/&lt;\?xml-stylesheet/);
 assert.doesNotMatch(html,/<(?:script|iframe|object|link|cfdi:Comprobante)\b/i);
});

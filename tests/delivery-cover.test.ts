import {test} from 'node:test'
import assert from 'node:assert/strict'
import {deliveryCoverIndex,documentCoverText} from '../lib/delivery-cover'
import type {DeliveryArtifact} from '../lib/task-deliveries'
const doc=(name:string)=>({kind:'document',name,format:'text',text:'Original de esta versión'}) as DeliveryArtifact
const pdf={kind:'pdf',name:'prueba.pdf',path:'private/original.pdf',mime:'application/pdf',size:42,sha256:'a'.repeat(64)} as DeliveryArtifact
const image={...pdf,kind:'image',name:'captura.png',mime:'image/png'} as DeliveryArtifact
const link={kind:'link',name:'Resultado',url:'https://example.com/private'} as DeliveryArtifact

test('covers use only artifacts from their version, preferring images then actual PDF then documents',()=>{
 assert.equal(deliveryCoverIndex([doc('readme.md'),pdf,image]),2)
 assert.equal(deliveryCoverIndex([doc('readme.md'),pdf]),1)
 assert.equal(deliveryCoverIndex([doc('original.XML'),doc('resumen.md')]),1)
 assert.equal(deliveryCoverIndex([doc('original.XML')]),0)
 assert.equal(deliveryCoverIndex([link]),0)
 assert.equal(deliveryCoverIndex([]),-1)
 const old=[doc('version1.md')],latest=[pdf]
 assert.equal(old[deliveryCoverIndex(old)].name,'version1.md')
 assert.equal(latest[deliveryCoverIndex(latest)].name,'prueba.pdf')
})
test('document cover excerpts remain bounded literal text without evaluating markup or URLs',()=>{
 assert.equal(documentCoverText('# Título\n\n<script>alert(1)</script>\nhttps://private.invalid'),'Título\n\n<script>alert(1)</script>\nhttps://private.invalid')
 assert.equal(documentCoverText('x'.repeat(64000)).length,900)
 assert.equal(documentCoverText('   '),'')
})

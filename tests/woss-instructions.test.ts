import {test} from 'node:test'
import assert from 'node:assert/strict'
import {canReadWossInstructions} from '../lib/woss-instructions-access'
import {instructionSections} from '../lib/woss-instructions-format'
import {parseInstructionsDocument} from '../lib/woss-instructions-document'
const document={updatedAt:'2026-10-20',markdown:'# Manual de prueba\n\nIntroducción de prueba.\n\n## Coordinación\nConservar los registros originales.\n\n## Revisión\n- Revisar evidencia\n- Registrar resultado'}

const woss={orgId:1,role:'viewer',user:{id:'woss-user',email:'woss@antuario.mx'},seat:{user_id:'woss-user',status:'active',access:'operator',write_areas:['people'],client_ids:[]}}
test('the complete leadership mandate is restricted to Antuario owner or active authenticated WOSS seat',()=>{
 assert.equal(canReadWossInstructions(woss),true)
 assert.equal(canReadWossInstructions({...woss,user:{...woss.user,email:'WOSS@antuario.mx'}}),true)
 assert.equal(canReadWossInstructions({...woss,role:'owner',seat:null}),true)
 assert.equal(canReadWossInstructions(null),false)
 assert.equal(canReadWossInstructions({...woss,orgId:2}),false)
 assert.equal(canReadWossInstructions({...woss,orgId:2,role:'owner'}),false)
 assert.equal(canReadWossInstructions({...woss,user:{...woss.user,email:'lisa@antuario.mx'}}),false)
 assert.equal(canReadWossInstructions({...woss,user:{...woss.user,email:'WOSS@example.com'}}),false)
 assert.equal(canReadWossInstructions({...woss,seat:null}),false)
 assert.equal(canReadWossInstructions({...woss,seat:{...woss.seat,status:'paused'}}),false)
 assert.equal(canReadWossInstructions({...woss,seat:{...woss.seat,user_id:'other-user'}}),false)
 assert.equal(canReadWossInstructions({...woss,seat:{...woss.seat,access:'viewer'}}),false)
 assert.equal(canReadWossInstructions({...woss,seat:{...woss.seat,write_areas:['finance']}}),false)
 assert.equal(canReadWossInstructions({...woss,seat:{...woss.seat,client_ids:['client']}}),false)
})
test('sectioning preserves the complete configured document',()=>{
 const manual=instructionSections(document.markdown)
 assert.equal(manual.sections.length,2)
 assert.equal(new Set(manual.sections.map(section=>section.id)).size,2)
 const reconstructed=['# '+manual.title,manual.introduction,...manual.sections.map(section=>'## '+section.title+'\n'+section.body)].join('\n\n')
 const normalize=(text:string)=>text.trim().replace(/\s+/g,' ')
 assert.equal(normalize(reconstructed),normalize(document.markdown))

})

test('private document configuration rejects malformed or incomplete input without leaking it',()=>{
 assert.deepEqual(parseInstructionsDocument(JSON.stringify(document)),document)
 for(const value of ['invalid','null','{}','{"markdown":"","updatedAt":"2026-10-20"}','{"markdown":"private text"}'])assert.equal(parseInstructionsDocument(value),null)
})

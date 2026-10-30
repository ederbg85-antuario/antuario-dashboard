import 'server-only'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {instructionSections} from './woss-instructions-format'
import {parseInstructionsDocument} from './woss-instructions-document'

function loadDocument() {
 // Production receives the same private document through server configuration.
 // The optional local copy must never enter the public Git repository.
 if(process.env.WOSS_INSTRUCTIONS_JSON)return parseInstructionsDocument(process.env.WOSS_INSTRUCTIONS_JSON)
 if(process.env.VERCEL)return null
 try{return parseInstructionsDocument(readFileSync(join(process.cwd(),'lib/private/woss-instructions.json'),'utf8'))}catch{return null}
}
const document=loadDocument()
export const wossInstructions=document?{...instructionSections(document.markdown),updatedAt:document.updatedAt}:null

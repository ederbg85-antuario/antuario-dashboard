import type {AccountFinancialBase,AccountInvoice,AccountPayment,AccountProfile} from './client-accounts-types'
import {validAccountDate} from './client-accounts-metrics'

type LegacyNumber=number|string|null
export type LegacyFinanceDocument={
 id:string;organization_id?:number;client_id?:string|null;client_name:string|null;kind:string;collection_status:string|null;
 title:string;uuid:string|null;issued_date:string;service_date:string|null;service_end:string|null;due_date:string|null;
 currency:string;subtotal:LegacyNumber;vat:LegacyNumber;retention:LegacyNumber;total:LegacyNumber;source:string;
 created_at?:string|null;updated_at?:string|null;created_by?:string|null;related_document_id?:string|null;related_invoice_uuid?:string|null;
}
export type LegacyFinanceEntry={
 id:string;organization_id?:number;direction:string;category?:string;evidence:string;cash_date:string|null;cash_amount:LegacyNumber;currency:string;document_id:string|null;source:string;
 created_at?:string|null;updated_at?:string|null;created_by?:string|null;receipt_document_id?:string|null;bank_reference?:string|null;
}
export type LegacyFinanceOptions={
 /** Explicit source verification, bound to the actual account. Never a global list of trusted ids. */
 verifiedDocumentAccounts?:Record<string,string>;
 verifiedEntryInvoices?:Record<string,string>;
 verifiedReceiptDocuments?:Record<string,string>;
}
const normalizeName=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('es-MX')
const uuid=(value:string|null|undefined)=>{const normalized=value?.trim().toLowerCase();return normalized&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)?normalized:null}
function numeric(value:LegacyNumber){if(value===null||typeof value==='string'&&!/^\d+(?:\.\d+)?$/.test(value.trim()))return null;const number=Number(value);return Number.isFinite(number)&&number>=0?number:null}
const timestamp=(value:string|null|undefined)=>value&&Number.isFinite(Date.parse(value))?value:null
const sameAmount=(a:number,b:number)=>Math.abs(a-b)<0.005
function belongsTo(account:AccountProfile,document:LegacyFinanceDocument,options:LegacyFinanceOptions){
 if(document.organization_id!==undefined&&document.organization_id!==account.organization_id)return false
 if(document.client_id)return document.client_id===account.id
 const verified=options.verifiedDocumentAccounts?.[document.id]
 if(verified)return verified===account.id
 return !!document.client_name&&normalizeName(document.client_name)===normalizeName(account.name)
}
function financialBase(account:AccountProfile,record:LegacyFinanceDocument|LegacyFinanceEntry,kind:'finance_document'|'finance_entry'):AccountFinancialBase{
 return {id:record.id,account_id:account.id,organization_id:account.organization_id,source_key:`legacy:${kind}:${record.id}`,created_by:record.created_by??null,created_at:timestamp(record.created_at),updated_at:timestamp(record.updated_at),is_example:false,read_only:true,legacy_source:kind}
}
function exactDocumentMatch(current:AccountInvoice,document:LegacyFinanceDocument){
 if(current.source_key===`legacy:finance_document:${document.id}`||current.id===document.id)return true
 return !!uuid(document.uuid)&&uuid(current.uuid)===uuid(document.uuid)&&current.currency===document.currency
}
function evidenceIncludesEntry(payment:AccountPayment,entry:LegacyFinanceEntry){
 const evidence=payment.evidence.toLowerCase()
 return evidence.includes(entry.id.toLowerCase())||!!entry.bank_reference&&entry.bank_reference.length>=8&&evidence.includes(entry.bank_reference.toLowerCase())
}

/**
 * Read-only projection of existing financial evidence. It never writes new ledger rows,
 * guesses cash dates, turns paid_amount into a payment, or matches a client by fuzzy name.
 */
export function mergeLegacyAccountFinance(account:AccountProfile,documents:LegacyFinanceDocument[],entries:LegacyFinanceEntry[],currentInvoices:AccountInvoice[]=[],currentPayments:AccountPayment[]=[],options:LegacyFinanceOptions={}){
 const invoices=[...currentInvoices],payments=[...currentPayments],warnings:string[]=[]
 if(account.is_example)return {invoices,payments,warnings}
 const eligible=documents.filter(document=>belongsTo(account,document,options))
 const projected=new Map<string,AccountInvoice>()
 for(const document of eligible){
  if(document.kind!=='invoice'||document.collection_status!=='active'||!validAccountDate(document.issued_date)||!['MXN','USD'].includes(document.currency))continue
  const subtotal=numeric(document.subtotal),vat=numeric(document.vat),retention=numeric(document.retention),total=numeric(document.total)
  if(subtotal===null||vat===null||retention===null||total===null){warnings.push(`Documento ${document.id}: importes de origen incompletos.`);continue}
  const current=invoices.find(invoice=>exactDocumentMatch(invoice,document))
  if(current){
   projected.set(document.id,current)
   if(!sameAmount(current.total,total)||current.currency!==document.currency||current.status!=='issued')warnings.push(`Documento ${document.id}: el registro de la cuenta difiere de la fuente financiera; requiere conciliación.`)
   continue
  }
  const invoice:AccountInvoice={...financialBase(account,document,'finance_document'),title:document.title,uuid:uuid(document.uuid),issued_date:document.issued_date,due_date:document.due_date&&validAccountDate(document.due_date)?document.due_date:null,period_from:document.service_date&&validAccountDate(document.service_date)?document.service_date:null,period_to:document.service_end&&validAccountDate(document.service_end)?document.service_end:null,subtotal,vat,retention,total,currency:document.currency as 'MXN'|'USD',status:'issued',evidence:`Fuente: finance_documents/${document.id}. ${document.source}`}
  invoices.push(invoice);projected.set(document.id,invoice)
 }
 for(const entry of entries){
  if(entry.organization_id!==undefined&&entry.organization_id!==account.organization_id||entry.direction!=='income'||entry.evidence!=='confirmed'||entry.category&&entry.category!=='revenue'||!entry.cash_date||!validAccountDate(entry.cash_date))continue
  const amount=numeric(entry.cash_amount)
  if(amount===null||amount<=0||!['MXN','USD'].includes(entry.currency))continue
  let invoice=projected.get(options.verifiedEntryInvoices?.[entry.id]??entry.document_id??'')
  const linkedDocument=eligible.find(document=>document.id===entry.document_id)
  if(!invoice&&linkedDocument?.kind==='payment'){
   if(linkedDocument.related_document_id)invoice=projected.get(linkedDocument.related_document_id)
   if(!invoice&&linkedDocument.related_invoice_uuid)invoice=[...projected.values()].find(item=>uuid(item.uuid)===uuid(linkedDocument.related_invoice_uuid))
  }
  // An actual cash receipt survives an absent/cancelled invoice. A linked client document
  // still proves account scope; payment CFDIs are evidence, never another sale or invoice.
  if(!invoice&&(!linkedDocument||!['invoice','payment'].includes(linkedDocument.kind)))continue
  if((invoice?.currency??linkedDocument?.currency)!==entry.currency)continue
  const invoiceId=invoice?.id??null
  const sourceKey=`legacy:finance_entry:${entry.id}`
  const existing=payments.find(payment=>payment.source_key===sourceKey||payment.id===entry.id||payment.invoice_id===invoiceId&&payment.date===entry.cash_date&&payment.currency===entry.currency&&sameAmount(payment.amount,amount)&&evidenceIncludesEntry(payment,entry))
  if(existing){
   if(existing.invoice_id!==invoiceId||existing.date!==entry.cash_date||existing.currency!==entry.currency||!sameAmount(existing.amount,amount))warnings.push(`Pago ${entry.id}: hay una referencia existente con datos diferentes; requiere conciliación.`)
   continue
  }
  const receiptId=options.verifiedReceiptDocuments?.[entry.id]??entry.receipt_document_id
  const receipt=receiptId?eligible.find(document=>document.id===receiptId):linkedDocument?.kind==='payment'?linkedDocument:undefined
  const issued=receipt?.kind==='payment'&&!!uuid(receipt.uuid)&&receipt.collection_status==='active'
  payments.push({...financialBase(account,entry,'finance_entry'),invoice_id:invoiceId,date:entry.cash_date,amount,currency:entry.currency as 'MXN'|'USD',receipt_status:issued?'issued':'pending',evidence:`Movimiento de ingreso confirmado: finance_entries/${entry.id}. ${entry.source}${issued?` Complemento vinculado: ${receipt.uuid}.`:' Complemento por verificar; no hay un CFDI de pago vinculado en esta proyección.'}${invoiceId?'':' Cobro sin aplicar a una factura activa en esta cuenta; no constituye otra factura.'}`})
 }
 return {invoices,payments,warnings}
}

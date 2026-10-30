import {formatAccountMoney} from './client-account-money'
export function privateMoney(value:number|null|undefined,currency:string,visible:boolean){
 return value==null?'Por confirmar':visible?formatAccountMoney(value,currency):'••••'
}
/** Visual privacy for explicit currency figures in source notes; never rewrites stored data. */
export function maskFinancialText(value:string){
 return value.replace(/(?:\b(?:MXN|USD|EUR)\s*\$?\s*[-−]?\s*\d(?:[\d.,]*\d)?(?:\s*(?:mil|millones?))?|(?:US\s*)?\$\s*[-−]?\s*\d(?:[\d.,]*\d)?(?:\s*(?:MXN|USD|EUR|pesos?|d[oó]lares?))?|[-−]?\b\d(?:[\d.,]*\d)?\s*(?:MXN|USD|EUR|pesos?|d[oó]lares?))/gi,'••••')
}

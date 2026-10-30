export function parseInstructionsDocument(value:string):{markdown:string;updatedAt:string}|null {
 try {
  const document=JSON.parse(value)
  if(!document||typeof document.markdown!=='string'||!document.markdown.trim()||typeof document.updatedAt!=='string'||!document.updatedAt.trim())return null
  return {markdown:document.markdown,updatedAt:document.updatedAt}
 } catch {return null}
}

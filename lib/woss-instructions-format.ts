export type InstructionSection={id:string;title:string;body:string}
export function instructionSections(markdown:string){
 const pieces=markdown.trim().split(/^## /m)
 const introduction=pieces.shift()??''
 const [heading,...intro]=introduction.split('\n')
 const sections:InstructionSection[]=pieces.map((piece,index)=>{
  const [title,...body]=piece.split('\n')
  return {id:`seccion-${index+1}`,title,body:body.join('\n').trim()}
 })
 return {title:heading.replace(/^# /,''),introduction:intro.join('\n').trim(),sections}
}

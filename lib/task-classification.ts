export const taskAreas={production:'Producción',marketing:'Marketing',sales:'Ventas',finance:'Finanzas',accounting:'Contabilidad',people:'Equipo'} as const
export type TaskArea=keyof typeof taskAreas
export function recordedAreas(task:{task_areas?:string[]}){return [...new Set(task.task_areas??[])].filter((a):a is TaskArea=>Object.hasOwn(taskAreas,a))}
export function recordedTags(task:{task_tags?:string[]}){return [...new Set((task.task_tags??[]).map(t=>t.trim().toLocaleLowerCase('es')).filter(Boolean))]}

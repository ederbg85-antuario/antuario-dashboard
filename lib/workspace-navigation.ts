export const TEAM_WORK_PATH = '/equipo/trabajo'
export const LEGACY_WORK_PATH = '/mi-trabajo'

export type WorkspaceLink = { href:string; label:string; icon:string }
export type WorkspaceSection = { key:string; label?:string; links:WorkspaceLink[] }
type Capabilities = Record<string,boolean> | undefined

const areas:WorkspaceSection[] = [
 {key:'production',label:'Producción',links:[{href:'/produccion',label:'Resumen',icon:'◈'},{href:'/proyectos',label:'Clientes y tareas',icon:'·'}]},
 {key:'marketing',label:'Marketing',links:[{href:'/marketing',label:'Resultados',icon:'↗'},{href:'/contenido',label:'Contenido',icon:'·'},{href:'/marketing/seo',label:'SEO',icon:'·'},{href:'/marketing/web',label:'Analytics',icon:'·'},{href:'/marketing/ads',label:'Google Ads',icon:'·'}]},
 {key:'sales',label:'Ventas',links:[{href:'/ventas/vision',label:'Resumen',icon:'◇'},{href:'/ventas/bandeja',label:'Bandeja',icon:'·'},{href:'/ventas/propuestas',label:'Propuestas',icon:'·'},{href:'/ventas/contactos',label:'Contactos',icon:'·'},{href:'/ventas/crm',label:'Pipeline',icon:'·'},{href:'/ventas/reuniones',label:'Agenda',icon:'·'}]},
 {key:'finance',label:'Finanzas',links:[{href:'/finanzas',label:'Resultados y caja',icon:'$'}]},
 {key:'accounting',label:'Contabilidad',links:[{href:'/contabilidad',label:'Documentos y pendientes',icon:'✓'}]},
]

export function teamSectionLinks(showPerformance:boolean):WorkspaceLink[]{
 return [
  {href:TEAM_WORK_PATH,label:'Trabajo',icon:'☷'},
  ...(showPerformance?[{href:'/equipo',label:'Rendimiento',icon:'◎'}]:[]),
 ]
}

/** Navigation follows capabilities; server routes and RLS remain authoritative. */
export function workspaceNavigation(capabilities?:Capabilities):WorkspaceSection[]{
 return [
  ...(!capabilities?.scopedProduction?[{key:'overview',links:[{href:'/dashboard',label:'Visión general',icon:'▦'}]}]:[]),
  ...(!capabilities||['production','marketing','sales','finance','accounting','people'].some(area=>capabilities[area])?[{key:'accounts',label:'Clientes',links:[{href:'/cuentas',label:'Cuentas',icon:'◎'}]}]:[]),
  ...areas.filter(area=>!capabilities||capabilities[area.key]),
  {key:'team',label:'Equipo',links:teamSectionLinks(!capabilities||!!capabilities.people)},
 ]
}

export type MobileWorkspaceLink = {key:string;href:string;label:string;match:string}
const mobileAreas:MobileWorkspaceLink[] = [
 {key:'finance',href:'/finanzas',label:'Finanzas',match:'/finanzas'},
 {key:'sales',href:'/ventas/bandeja',label:'Bandeja',match:'/ventas'},
 {key:'production',href:'/proyectos',label:'Proyectos',match:'/proyectos'},
 {key:'marketing',href:'/marketing',label:'Marketing',match:'/marketing'},
 {key:'accounting',href:'/contabilidad',label:'Contabilidad',match:'/contabilidad'},
]

export function mobileWorkspaceNavigation(capabilities?:Capabilities):MobileWorkspaceLink[]{
 return [
  ...(!capabilities?.scopedProduction?[{key:'overview',href:'/dashboard',label:'Inicio',match:'/dashboard'}]:[]),
  {key:'team',href:TEAM_WORK_PATH,label:'Equipo',match:'/equipo'},
  ...mobileAreas.filter(item=>!capabilities||capabilities[item.key]).slice(0,2),
 ]
}

/** Direction keeps one entry per area; each area retains its full local navigation. */
export function overviewNavigation(capabilities?:Capabilities):WorkspaceSection[]{
 const allowed=(area:string)=>!capabilities||capabilities[area]
 return [
  {key:'overview',links:[{href:'/dashboard',label:'Visión general',icon:'▦'}]},
  ...(!capabilities||['production','marketing','sales','finance','accounting','people'].some(allowed)?[{key:'accounts',links:[{href:'/cuentas',label:'Cuentas',icon:'◎'}]}]:[]),
  {key:'business',label:'Negocio',links:[
   ...(allowed('marketing')?[{href:'/marketing',label:'Marketing',icon:'↗'}]:[]),
   ...(allowed('sales')?[{href:'/ventas/vision',label:'Ventas',icon:'◇'}]:[]),
   ...(allowed('finance')?[{href:'/finanzas',label:'Finanzas',icon:'$'}]:[]),
   ...(allowed('production')?[{href:'/produccion',label:'Producción',icon:'◈'}]:[]),
  ]},
  {key:'support',label:'Gestión',links:[
   ...(allowed('marketing')?[{href:'/contenido',label:'Contenido',icon:'▤'}]:[]),
   ...(allowed('accounting')?[{href:'/contabilidad',label:'Contabilidad',icon:'✓'}]:[]),
   {href:TEAM_WORK_PATH,label:'Trabajo del equipo',icon:'☷'},
   ...(allowed('people')?[{href:'/equipo',label:'Equipo y rendimiento',icon:'◎'}]:[]),
  ]},
 ].filter(section=>section.links.length)
}

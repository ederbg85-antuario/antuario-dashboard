export const stages = [
  ['detectado', 'Detectado'],
  ['validado', 'Validado'],
  ['correo', 'Correo inicial'],
  ['seguimiento', 'Seguimiento por correo'],
  ['whatsapp', 'WhatsApp'],
  ['llamada', 'Llamada'],
  ['sin_respuesta', 'Cerrado sin respuesta'],
  ['respondio', 'Respondió'],
  ['prospectado', 'Prospectado'],
  ['interes', 'Interés real'],
  ['agendada', 'Reunión agendada'],
  ['realizada', 'Reunión realizada'],
  ['propuesta', 'Propuesta'],
  ['excluido', 'No contactar'],
] as const
export const stageName = (value: string) => stages.find(([id]) => value === id)?.[1] ?? value
export const channelName = (value: string) =>
  ({
    email: 'Correo',
    whatsapp: 'WhatsApp',
    llamada: 'Llamada',
    linkedin: 'LinkedIn',
    visita: 'Visita',
  })[value] ?? value
export const dayMX = (at: Date | string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at))
export function localDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value + 'T12:00:00Z'))
}
export const percent = (n: number, d: number) =>
  d
    ? new Intl.NumberFormat('es-MX', { style: 'percent', maximumFractionDigits: 1 }).format(n / d)
    : 'Sin datos'
export type Person = {
  id: string
  name: string
  position: string | null
  email: string | null
  phone: string | null
}
export type Entry = {
  id: string
  type: string
  channel: string | null
  outcome: string | null
  body: string | null
  at: string
  author: string
}
export type Deal = {
  id: string
  company: string
  owner: string | null
  source: string
  zone: string | null
  name: string | null
  position: string | null
  email: string | null
  phone: string | null
  primaryContact: string | null
  nextAction: string | null
  due: string | null
  stage: string
  fit: string | null
  decision: string | null
  interest: string | null
  experiment: string | null
  arm: string | null
  wa: boolean
  call: boolean
  meeting: string | null
  attendees: string | null
  objective: string | null
  revision: number
  changed: string
  people: Person[]
  history: Entry[]
}
export type Workspace = {
  userId: string
  admin: boolean
  canWrite: boolean
  handoff: string
  goal: number
  members: { id: string; label: string; manager: boolean; writable: boolean }[]
  deals: Deal[]
}
export type Metrics = {
  week: string
  goal: number
  trend: { week: string; n: number }[]
  funnel: number[]
  overdue: number
  channels: { channel: string; attempts: number; responses: number }[]
  experiments: {
    experiment: string
    base: number
    test: number
    base_yes: number
    test_yes: number
  }[]
}
export type Command = Record<string, string | boolean | number | null>
export const allowedStages = (stage: string) => {
  const i = stages.findIndex(([k]) => k === stage)
  if (i < 0 || stage === 'excluido') return []
  return [
    ...(i < 6 || (i >= 7 && i < 12) ? [stages[i + 1][0]] : []),
    ...(i <= 6 ? ['respondio'] : []),
    'excluido',
  ]
}

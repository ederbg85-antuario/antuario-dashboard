/** Shared mappings live outside Next.js route modules, whose exports are restricted. */
export const CONTACT_TYPE_TO_LABEL: Record<string, string> = {
  lead_irrelevant: 'lead-irrelevante',
  lead_potential: 'lead-potencial',
  lead_relevant: 'lead-relevante',
  proposal: 'propuesta',
  active_proposal: 'propuesta-activa',
  client: 'cliente',
}

export const LABEL_TO_CONTACT_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(CONTACT_TYPE_TO_LABEL).map(([key, value]) => [value, key]),
)

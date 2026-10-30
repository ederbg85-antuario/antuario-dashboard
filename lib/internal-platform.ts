/** Antuario is a private workspace; public onboarding is intentionally disabled. */
export const ANTUARIO_ORG_ID = 1
export const GOOGLE_SOURCES = ['ga4', 'search_console', 'gtm'] as const
export type GoogleSource = typeof GOOGLE_SOURCES[number]
export function isGoogleSource(value: string): value is GoogleSource {
  return GOOGLE_SOURCES.some(source => source === value)
}
export const GOOGLE_TARGETS = {
  ga4: '522821969',
  search_console: 'https://www.antuario.mx/',
  gtm: 'GTM-K55R84FC',
} as const

import 'server-only'
import { ExternalAccountClient } from 'google-auth-library'
import { getVercelOidcToken } from '@vercel/oidc'
import type { GoogleSource } from './internal-platform'

const scopes: Record<GoogleSource, string> = {
  ga4: 'https://www.googleapis.com/auth/analytics.readonly',
  search_console: 'https://www.googleapis.com/auth/webmasters.readonly',
  gtm: 'https://www.googleapis.com/auth/tagmanager.readonly',
}

export function internalGoogleConfigured() {
  return ['GCP_PROJECT_NUMBER','GCP_SERVICE_ACCOUNT_EMAIL','GCP_WORKLOAD_IDENTITY_POOL_ID','GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID'].every(key => !!process.env[key])
}

/** Vercel's short-lived identity is exchanged for a read-only Google token.
 * No private key, user refresh token or Google token is persisted in the database. */
export async function internalGoogleToken(source: GoogleSource) {
  if (!internalGoogleConfigured()) throw new Error('La cuenta técnica de Google está pendiente de configuración.')
  const audience = `//iam.googleapis.com/projects/${process.env.GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${process.env.GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`
  const client = ExternalAccountClient.fromJSON({
    type: 'external_account', audience,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(process.env.GCP_SERVICE_ACCOUNT_EMAIL!)}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
  })
  if (!client) throw new Error('La identidad técnica de Google no es válida.')
  client.scopes = [scopes[source]]
  let token: string | null | undefined
  try {
    ;({ token } = await client.getAccessToken())
  } catch (error) {
    // Record only structured provider codes; never log request headers or tokens.
    const failure = error as { name?: string; response?: { status?: number; data?: { error?: string | { status?: string; details?: Array<{ reason?: string }> } } } }
    const provider = failure.response?.data?.error
    console.error('internal_google_identity_failed', {
      source, type: failure.name, status: failure.response?.status,
      code: typeof provider === 'string' ? provider : provider?.status,
      reasons: typeof provider === 'object' ? provider.details?.map(detail => detail.reason).filter(Boolean) : undefined,
    })
    throw new Error('Google no pudo autorizar la identidad del servidor.')
  }
  if (!token) throw new Error('Google no pudo autorizar la cuenta técnica.')
  return token
}

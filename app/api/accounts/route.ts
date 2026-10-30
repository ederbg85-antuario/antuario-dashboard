import { NextResponse } from 'next/server'
import { workspace } from '@/lib/workspace'
import { listClientAccounts } from '@/lib/client-accounts-access'

/** v1 account API is additive; /api/team-work remains unchanged. */
export async function GET() {
  const c = await workspace()
  if (!c) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 })
  const result = await listClientAccounts(c)
  return NextResponse.json(result, {
    status: result.schema_ready && result.errors.length ? 503 : 200,
    headers: { 'Cache-Control': 'private, no-store' }
  })
}

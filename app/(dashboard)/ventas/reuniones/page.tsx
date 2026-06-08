import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

type MeetingRow = {
  id: string
  full_name: string | null
  company: string | null
  email: string | null
  whatsapp: string | null
  phone: string | null
  meeting_at: string
  meeting_link: string | null
  meeting_status: string | null
  client_role: string | null
  lead_archetype: string | null
  end_brand: string | null
  opportunity: string | null
}

const STATUS: Record<string, { label: string; cls: string }> = {
  scheduled:   { label: 'Agendada',   cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  rescheduled: { label: 'Reagendada', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  completed:   { label: 'Completada', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
}
const ARQ: Record<string, string> = { defined_project: 'Proyecto definido', needs_development: 'Por desarrollar', unclear: 'Sin definir' }
const ROLE: Record<string, string> = { direct: 'Cliente directo', intermediary: 'Intermediario', employee: 'Empleado', unknown: '—' }

function fmt(d: string) {
  return new Date(d).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  })
}

function MeetingCard({ m }: { m: MeetingRow }) {
  const st = STATUS[m.meeting_status ?? 'scheduled'] ?? STATUS.scheduled
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[#222a3a] bg-white dark:bg-[#11151f] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            {m.full_name ?? 'Lead'}{m.company ? <span className="font-normal text-slate-500 dark:text-slate-400"> · {m.company}</span> : null}
          </p>
          <p className="mt-0.5 text-[13px] capitalize text-slate-600 dark:text-slate-300">🗓️ {fmt(m.meeting_at)}</p>
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-md ${st.cls}`}>{st.label}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {m.client_role && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#1a2030] text-slate-600 dark:text-slate-300">{ROLE[m.client_role] ?? m.client_role}</span>}
        {m.lead_archetype && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#1a2030] text-slate-600 dark:text-slate-300">{ARQ[m.lead_archetype] ?? m.lead_archetype}</span>}
        {m.end_brand && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Marca: {m.end_brand}</span>}
      </div>

      {m.opportunity && <p className="mt-3 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">{m.opportunity}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {m.meeting_link && (
          <a href={m.meeting_link} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
            Unirse al Meet
          </a>
        )}
        <Link href={`/ventas/contactos?contact=${m.id}`} className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          Ver contacto →
        </Link>
      </div>
    </div>
  )
}

export default async function ReunionesPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(s) { try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships').select('organization_id').eq('user_id', user.id).eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/crear-organizacion')

  const { data } = await supabase
    .from('contacts')
    .select('id, full_name, company, email, whatsapp, phone, meeting_at, meeting_link, meeting_status, client_role, lead_archetype, end_brand, opportunity')
    .eq('organization_id', membership.organization_id)
    .not('meeting_at', 'is', null)
    .neq('meeting_status', 'cancelled')
    .order('meeting_at', { ascending: true })

  const rows = (data ?? []) as MeetingRow[]
  const cutoff = Date.now() - 60 * 60 * 1000 // en curso = hasta 1h después
  const upcoming = rows.filter(m => new Date(m.meeting_at).getTime() >= cutoff)
  const past = rows.filter(m => new Date(m.meeting_at).getTime() < cutoff).reverse()

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">Reuniones</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Reuniones agendadas por el Agente IA. Las creadas/reagendadas también están en tu Google Calendar (hola@antuario.mx).
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Próximas ({upcoming.length})</h2>
        {upcoming.length === 0
          ? <p className="rounded-xl border border-dashed border-slate-300 dark:border-[#222a3a] p-6 text-center text-sm text-slate-500">No tienes reuniones próximas.</p>
          : <div className="grid gap-3">{upcoming.map(m => <MeetingCard key={m.id} m={m} />)}</div>}
      </section>

      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Pasadas ({past.length})</h2>
          <div className="grid gap-3 opacity-70">{past.map(m => <MeetingCard key={m.id} m={m} />)}</div>
        </section>
      )}
    </div>
  )
}

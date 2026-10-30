import DateFilterBar from '@/components/layout/DateFilterBar'
import SignOutButton from '@/components/common/SignOutButton'
import { FinancialPrivacyToggle } from '@/components/privacy/FinancialPrivacy'

type Props = {
  compact?: boolean
  userName: string
  avatarUrl?: string | null
  showDateFilter?: boolean
  onMenuClick?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  topbarLeft?: string
  onFullscreen?: () => void
}

export default function Topbar({
  compact = false, userName, avatarUrl, showDateFilter = true,
  onMenuClick, collapsed = false, onToggleCollapse,
  topbarLeft = 'md:left-[16rem]',
  onFullscreen,
}: Props) {
  const firstName = userName.split(' ')[0]
  const hour = Number(new Intl.DateTimeFormat('en-GB',{hour:'numeric',hourCycle:'h23',timeZone:'America/Mexico_City'}).format(new Date()))

  const greeting =
    hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const subtitle =
    'Antuario · espacio de trabajo'

  const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long',timeZone:'America/Mexico_City' })
  const todayFormatted = today.charAt(0).toUpperCase() + today.slice(1)

  if (collapsed) return null

  return (
    <header
      className={`op-topbar fixed left-4 right-4 top-4 z-40 flex h-[60px] items-center gap-3 rounded-2xl px-4 transition-all duration-300 md:gap-4 md:px-5 ${topbarLeft}`}
      style={{
        background: 'var(--topbar-bg)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        boxShadow: 'var(--topbar-shadow)',
      }}
    >
      {/* ── Hamburger (mobile only) ─────────────────────── */}
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          aria-label="Abrir menú"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-all hover:bg-slate-100/80 hover:text-slate-800 active:scale-95 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-white md:hidden"
        >
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* ── Saludo ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
        <span className="op-topbar-spark text-xl md:text-2xl leading-none select-none shrink-0 hidden sm:inline-block">✦</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight text-slate-900 dark:text-white md:text-[15px]">
            {compact?'Antuario':greeting+','} <span className="font-extrabold">{compact?'· Operación':firstName}</span>
          </p>
          <p className="mt-0.5 hidden truncate text-[11px] text-slate-600 dark:text-slate-400 sm:block">{compact?todayFormatted:subtitle}</p>
        </div>
      </div>

      {/* ── Fecha ──────────────────────────────────────────── */}
      <span className="hidden shrink-0 text-xs font-medium text-slate-600 dark:text-slate-400 xl:block">
        {todayFormatted}
      </span>

      {/* ── Filtro de fechas ───────────────────────────────── */}
      {showDateFilter && <DateFilterBar />}

      {/* ── Avatar ─────────────────────────────────────────── */}
      <FinancialPrivacyToggle />
      <div className="flex items-center gap-2 shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt={userName} width={32} height={32} className="h-8 w-8 rounded-full object-cover shadow-md " />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-slate-900 text-[11px] font-bold text-white shadow-md ">
            {firstName[0]?.toUpperCase()}
          </div>
        )}
        <span className="hidden text-sm font-semibold text-slate-600 dark:text-slate-300 md:block">
          {firstName}
        </span>
      </div>

      <SignOutButton compact={compact} />

      {/* ── Fullscreen button ───────────────────────────────── */}
      {onFullscreen && (
        <button
          onClick={onFullscreen}
          title="Pantalla completa"
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-all hover:bg-slate-100/80 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-300 md:flex"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      )}

      {/* ── Minimize topbar button ─────────────────────────── */}
      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          title="Ocultar barra"
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-all hover:bg-slate-100/80 hover:text-slate-600 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-300 md:flex"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}
    </header>
  )
}

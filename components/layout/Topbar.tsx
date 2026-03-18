import DateFilterBar from '@/components/layout/DateFilterBar'

type Props = {
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
  userName, avatarUrl, showDateFilter = true,
  onMenuClick, collapsed = false, onToggleCollapse,
  topbarLeft = 'md:left-[16rem]',
  onFullscreen,
}: Props) {
  const firstName = userName.split(' ')[0]
  const hour = new Date().getHours()

  const greeting =
    hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const subtitle =
    hour < 12 ? 'Aquí está todo lo que necesitas saber para empezar fuerte.' :
    hour < 19 ? 'Tus métricas del día, en tiempo real.' :
    'Cierra el día con datos reales en mano.'

  const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  const todayFormatted = today.charAt(0).toUpperCase() + today.slice(1)

  if (collapsed) return null

  return (
    <header
      className={`fixed top-4 left-4 right-4 ${topbarLeft} z-40 h-[60px] flex items-center px-4 md:px-5 gap-3 md:gap-4 rounded-2xl transition-all duration-300`}
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
          className="md:hidden shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-white/[0.08] transition-all active:scale-95"
        >
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* ── Saludo ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
        <span className="hand-wave text-xl md:text-2xl leading-none select-none shrink-0 hidden sm:inline-block">👋</span>
        <div className="min-w-0">
          <p className="text-[13px] md:text-[15px] font-bold text-slate-900 dark:text-white leading-tight truncate">
            {greeting}, <span className="font-extrabold">{firstName}</span>
          </p>
          <p className="text-[10px] md:text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate hidden sm:block">{subtitle}</p>
        </div>
      </div>

      {/* ── Fecha ──────────────────────────────────────────── */}
      <span className="hidden xl:block text-[11px] text-slate-400 dark:text-slate-500 font-medium shrink-0">
        {todayFormatted}
      </span>

      {/* ── Filtro de fechas ───────────────────────────────── */}
      {showDateFilter && <DateFilterBar />}

      {/* ── Avatar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt={userName} className="w-8 h-8 rounded-full object-cover shadow-md ring-2 ring-white dark:ring-slate-700" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-500 to-slate-800 flex items-center justify-center text-[11px] font-bold text-white shadow-md ring-2 ring-white dark:ring-slate-700">
            {firstName[0]?.toUpperCase()}
          </div>
        )}
        <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300 hidden md:block">
          {firstName}
        </span>
      </div>

      {/* ── Fullscreen button ───────────────────────────────── */}
      {onFullscreen && (
        <button
          onClick={onFullscreen}
          title="Pantalla completa"
          className="hidden md:flex shrink-0 w-7 h-7 rounded-lg items-center justify-center text-slate-300 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-white/[0.06] transition-all"
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
          className="hidden md:flex shrink-0 w-7 h-7 rounded-lg items-center justify-center text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-white/[0.06] transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}
    </header>
  )
}

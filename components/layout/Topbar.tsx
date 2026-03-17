import DateFilterBar from '@/components/layout/DateFilterBar'

type Props = {
  userName: string
  avatarUrl?: string | null
  showDateFilter?: boolean
  onMenuClick?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  topbarLeft?: string
}

export default function Topbar({
  userName, avatarUrl, showDateFilter = true,
  onMenuClick, collapsed = false, onToggleCollapse,
  topbarLeft = 'md:left-[16rem]',
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
    <>
      <style>{`
        @keyframes hand-wave {
          0%,100%{transform:rotate(-8deg)}25%{transform:rotate(20deg)}50%{transform:rotate(-5deg)}75%{transform:rotate(15deg)}
        }
        .hand-wave{display:inline-block;transform-origin:70% 80%;animation:hand-wave 2.6s ease-in-out infinite}
      `}</style>

      <header
        className={`fixed top-4 left-4 right-4 ${topbarLeft} z-40 h-[60px] flex items-center px-4 md:px-5 gap-3 md:gap-4 rounded-2xl transition-all duration-300`}
        style={{
          background: 'var(--topbar-bg, rgba(255,255,255,0.72))',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          boxShadow: 'var(--topbar-shadow, 0 8px 32px rgba(0,0,0,0.08), 0 1px 0 rgba(255,255,255,1) inset, 0 0 0 1px rgba(148,163,184,0.14))',
        }}
      >
        <style>{`
          :root {
            --topbar-bg: rgba(255,255,255,0.72);
            --topbar-shadow: 0 8px 32px rgba(0,0,0,0.08), 0 1px 0 rgba(255,255,255,1) inset, 0 0 0 1px rgba(148,163,184,0.14);
          }
          .dark {
            --topbar-bg: rgba(22,27,39,0.85);
            --topbar-shadow: 0 8px 32px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.03) inset, 0 0 0 1px rgba(255,255,255,0.06);
          }
        `}</style>

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
    </>
  )
}

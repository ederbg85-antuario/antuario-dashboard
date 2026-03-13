import DateFilterBar from '@/components/layout/DateFilterBar'

type Props = {
  userName: string
  avatarUrl?: string | null
  showDateFilter?: boolean
}

export default function Topbar({ userName, avatarUrl, showDateFilter = true }: Props) {
  const firstName = userName.split(' ')[0]

  const hour = new Date().getHours()

  const greeting =
    hour < 12 ? 'Buenos días' :
      hour < 19 ? 'Buenas tardes' : 'Buenas noches'

  const subtitle =
    hour < 12 ? 'Aquí está todo lo que necesitas saber para empezar fuerte.' :
      hour < 19 ? 'Tus métricas del día, en tiempo real.' :
        'Cierra el día con datos reales en mano.'

  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  const todayFormatted = today.charAt(0).toUpperCase() + today.slice(1)

  return (
    <>
      <style>{`
        @keyframes hand-wave {
          0%,  100% { transform: rotate(-8deg); }
          25%        { transform: rotate(20deg); }
          50%        { transform: rotate(-5deg); }
          75%        { transform: rotate(15deg); }
        }
        .hand-wave {
          display: inline-block;
          transform-origin: 70% 80%;
          animation: hand-wave 2.6s ease-in-out infinite;
        }
      `}</style>

      <header
        className="fixed top-4 left-[16rem] right-4 z-40 h-[60px] flex items-center px-5 gap-5 rounded-2xl"
        style={{
          background: 'rgba(255, 255, 255, 0.62)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          boxShadow:
            '0 8px 32px rgba(0, 0, 0, 0.08), 0 1px 0 rgba(255,255,255,1) inset, 0 0 0 1px rgba(148,163,184,0.14)',
        }}
      >

        {/* ── Saludo ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-1 min-w-0">

          {/* Emoji manita animada */}
          <span className="hand-wave text-2xl leading-none select-none shrink-0">👋</span>

          <div className="min-w-0">
            <p className="text-[15px] font-bold text-slate-900 leading-tight truncate">
              {greeting},{' '}
              <span className="font-extrabold">{firstName}</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">{subtitle}</p>
          </div>
        </div>

        {/* ── Fecha ──────────────────────────────────────────── */}
        <span className="hidden xl:block text-[11px] text-slate-400 font-medium shrink-0">
          {todayFormatted}
        </span>

        {/* ── Filtro de fechas ───────────────────────────────── */}
        {showDateFilter && <DateFilterBar />}

        {/* ── Avatar ─────────────────────────────────────────── */}
        <div className="flex items-center gap-2 shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={userName}
              className="w-8 h-8 rounded-full object-cover shadow-md ring-2 ring-white"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-500 to-slate-800 flex items-center justify-center text-[11px] font-bold text-white shadow-md ring-2 ring-white">
              {firstName[0]?.toUpperCase()}
            </div>
          )}
          <span className="text-[13px] font-medium text-slate-600 hidden md:block">
            {firstName}
          </span>
        </div>

      </header>
    </>
  )
}

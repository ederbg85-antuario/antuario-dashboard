import DateFilterBar from '@/components/layout/DateFilterBar'

type Props = {
  userName:       string
  avatarUrl?:     string | null
  showDateFilter?: boolean
}

export default function Topbar({ userName, avatarUrl, showDateFilter = true }: Props) {
  const firstName = userName.split(' ')[0]

  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Buenos días' :
    hour < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <header className="fixed top-0 left-56 right-0 z-50 h-14 bg-white border-b border-slate-200 flex items-center px-6 gap-4">
      {/* Saludo */}
      <p className="text-sm text-slate-500 flex-1">
        {greeting}, <span className="font-semibold text-slate-800">{firstName}</span>
        <span className="text-slate-400"> · me alegra verte de nuevo</span>
      </p>

      {/* Filtro global de fechas */}
      {showDateFilter && <DateFilterBar />}

      {/* Avatar */}
      <div className="flex items-center gap-2">
        {avatarUrl ? (
          <img src={avatarUrl} alt={userName}
            className="w-8 h-8 rounded-full object-cover border border-slate-200" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
            {firstName[0]?.toUpperCase()}
          </div>
        )}
        <span className="text-sm font-medium text-slate-700 hidden md:block">{firstName}</span>
      </div>
    </header>
  )
}

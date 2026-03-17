'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Props = {
  onMenuClick: () => void
}

// ─── Icons ───────────────────────────────────────────────────────────────────

const Icons = {
  dashboard: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  marketing: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
    </svg>
  ),
  ventas: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  ),
  proyectos: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  menu: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
}

// ─── Nav items ───────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Inicio', icon: Icons.dashboard, match: '/dashboard' },
  { href: '/marketing', label: 'Marketing', icon: Icons.marketing, match: '/marketing' },
  { href: '/ventas/bandeja', label: 'Ventas', icon: Icons.ventas, match: '/ventas' },
  { href: '/proyectos', label: 'Proyectos', icon: Icons.proyectos, match: '/proyectos' },
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function MobileBottomNav({ onMenuClick }: Props) {
  const pathname = usePathname()

  return (
    // Only visible on mobile, hidden on md+
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden"
      style={{
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        boxShadow: '0 -1px 0 rgba(148,163,184,0.12), 0 -8px 32px rgba(0,0,0,0.08)',
      }}
    >
      {/* Safe area padding for iPhone notch */}
      <div className="flex items-center justify-around px-2 pt-2 pb-safe"
        style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
      >

        {/* Main nav tabs */}
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href ||
            (item.match !== '/dashboard' && pathname.startsWith(item.match))

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-2xl min-w-[56px] transition-all duration-150 active:scale-95
                ${isActive
                  ? 'text-slate-900'
                  : 'text-slate-400 hover:text-slate-600'
                }`}
            >
              {/* Icon with active indicator */}
              <div className={`relative flex items-center justify-center w-9 h-7 rounded-2xl transition-all duration-200
                ${isActive
                  ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
                  : 'text-slate-400'
                }`}>
                {item.icon}
              </div>

              {/* Label */}
              <span className={`text-[10px] leading-none font-medium transition-colors
                ${isActive ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}>
                {item.label}
              </span>
            </Link>
          )
        })}

        {/* Menu button (opens sidebar drawer) */}
        <button
          onClick={onMenuClick}
          className="flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-2xl min-w-[56px] text-slate-400 hover:text-slate-600 transition-all duration-150 active:scale-95"
        >
          <div className="flex items-center justify-center w-9 h-7 rounded-2xl text-slate-400">
            {Icons.menu}
          </div>
          <span className="text-[10px] leading-none font-medium text-slate-400">Menú</span>
        </button>

      </div>
    </nav>
  )
}

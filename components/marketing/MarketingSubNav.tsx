'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Props = {
  connectedSources: string[]
}

const TABS = [
  { href: '/marketing',     label: 'Visión General', source: null,             icon: '◈', comingSoon: false },
  { href: '/marketing/web', label: 'Página Web',     source: 'ga4',            icon: '◉', comingSoon: false },
  { href: '/marketing/seo', label: 'SEO',            source: 'search_console', icon: '◎', comingSoon: false },
  { href: '/marketing/ads', label: 'Google Ads',     source: 'google_ads',     icon: '◆', comingSoon: false },
  { href: '/marketing/gmb', label: 'Google Maps',    source: 'google_business_profile',            icon: '◍', comingSoon: false },
]

const COMING_SOON = [
  { label: 'Instagram' },
  { label: 'Facebook' },
  { label: 'LinkedIn' },
  { label: 'TikTok' },
]

export default function MarketingSubNav({ connectedSources }: Props) {
  const pathname = usePathname()

  return (
    <div className="fixed top-[76px] left-0 right-0 md:left-56 z-40 bg-white border-b border-slate-200 px-4 md:px-6">
      <div className="flex items-center gap-1 overflow-x-auto">
        {TABS.map(tab => {
          const isActive  = pathname === tab.href
          const connected = tab.source ? connectedSources.includes(tab.source) : connectedSources.length > 0

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <span className={isActive ? 'text-slate-900' : 'text-slate-400'}>{tab.icon}</span>
              {tab.label}
              {tab.source && (
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              )}
            </Link>
          )
        })}

        <div className="w-px h-5 bg-slate-200 mx-2 shrink-0" />

        {COMING_SOON.map(item => (
          <div key={item.label}
            className="flex items-center gap-2 px-4 py-3 text-sm text-slate-300 whitespace-nowrap cursor-not-allowed border-b-2 border-transparent">
            {item.label}
            <span className="text-xs bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full">Pronto</span>
          </div>
        ))}
      </div>
    </div>
  )
}

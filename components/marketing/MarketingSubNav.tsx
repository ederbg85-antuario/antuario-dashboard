'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Props = {
  connectedSources: string[]
}

const TABS = [
  { href: '/marketing',           label: 'Visi�n General', source: null,                    icon: '�' },
  { href: '/marketing/web',       label: 'P�gina Web',     source: 'ga4',                   icon: '�' },
  { href: '/marketing/seo',       label: 'SEO',            source: 'search_console',        icon: '�' },
  { href: '/marketing/ads',       label: 'Google Ads',     source: 'google_ads',            icon: '�' },
  { href: '/marketing/gmb',       label: 'Google Maps',    source: 'google_business_profile', icon: '�' },
  { href: '/marketing/meta',      label: 'Meta Ads',       source: 'meta_ads',              icon: '�' },
  { href: '/marketing/facebook',  label: 'Facebook',       source: 'facebook',              icon: '�' },
  { href: '/marketing/instagram', label: 'Instagram',      source: 'instagram',             icon: '�' },
]

const COMING_SOON = [
  { label: 'LinkedIn' },
  { label: 'TikTok'   },
]

export default function MarketingSubNav({ connectedSources }: Props) {
  const pathname = usePathname()

  return (
    <div className="fixed top-[76px] left-0 right-0 md:left-56 z-40 bg-white dark:bg-[#1e2535] border-b border-slate-200 dark:border-white/[0.07] px-2 md:px-6">
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide -mx-2 md:mx-0 md:px-0 px-2">
        {TABS.map(tab => {
          const isActive  = pathname === tab.href
          const connected = tab.source ? connectedSources.includes(tab.source) : connectedSources.length > 0

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2 px-3 md:px-4 py-3 text-sm md:text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-white/[0.2]'
              }`}
            >
              <span className={`shrink-0 ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.source && (
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
              )}
            </Link>
          )
        })}

        <div className="w-px h-5 bg-slate-200 dark:bg-white/[0.07] mx-1 md:mx-2 shrink-0" />

        {COMING_SOON.map(item => (
          <div key={item.label}
            className="flex items-center gap-2 px-3 md:px-4 py-3 text-xs md:text-sm text-slate-300 dark:text-slate-600 whitespace-nowrap cursor-not-allowed border-b-2 border-transparent">
            <span className="hidden sm:inline">{item.label}</span>
            <span className="text-xs bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-slate-500 px-1.5 py-0.5 rounded-full shrink-0">Pronto</span>
          </div>
        ))}
      </div>
    </div>
  )
}

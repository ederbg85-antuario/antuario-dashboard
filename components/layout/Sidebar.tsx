'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useTheme } from '@/providers/ThemeProvider'

type Props = {
  orgName: string | null
  orgId: number
  logoSignedUrl: string | null
  mobileOpen?: boolean
  onClose?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
  badge?: string
  badgeVariant?: 'live' | 'warning' | 'data' | 'default'
  iconColor?: string
}
type NavSection = {
  title: string
  items: NavItem[]
  collapsible?: boolean
  comingSoon?: { label: string; icon: React.ReactNode }[]
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const I = {
  vision:     <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  objectives: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>,
  chart:      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>,
  contacts:   <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  building:   <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
  leads:      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
  proposals:  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  orders:     <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
  inbox:      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>,
  clients:    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>,
  projects:   <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  settings:   <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  user:       <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  logout:     <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  chevron:    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>,
  chevronLeft:<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>,
  chevronRight:<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>,
  sun:        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 110 10A5 5 0 0112 7z" /></svg>,
  moon:       <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>,
  // Social
  facebook:   <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  instagram:  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>,
  tiktok:     <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.75a4.85 4.85 0 01-1.01-.06z"/></svg>,
  linkedin:   <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 23.2 24 22.222 0h.003z"/></svg>,
}

// ─── Nav structure ────────────────────────────────────────────────────────────
const NAV: NavSection[] = [
  {
    title: '',
    items: [
      { href: '/dashboard',  label: 'Visión Maestra', icon: I.vision,     badge: 'Live', badgeVariant: 'live', iconColor: 'bg-emerald-500' },
      { href: '/objetivos',  label: 'Objetivos',      icon: I.objectives, iconColor: 'bg-violet-500' },
    ],
  },
  {
    title: 'Marketing',
    collapsible: true,
    items: [
      { href: '/marketing',      label: 'Visión Marketing', icon: I.vision, iconColor: 'bg-blue-500' },
      { href: '/marketing/web',  label: 'Página Web',       icon: I.chart,  badge: 'GA4', badgeVariant: 'data', iconColor: 'bg-sky-500' },
      { href: '/marketing/seo',  label: 'Google SEO',       icon: I.chart,  badge: 'GSC', badgeVariant: 'data', iconColor: 'bg-indigo-500' },
      { href: '/marketing/ads',  label: 'Google Ads',       icon: I.chart,  badge: 'Ads', badgeVariant: 'data', iconColor: 'bg-blue-400' },
      { href: '/marketing/gmb',  label: 'Google Maps',      icon: I.chart,  badge: 'GMB', badgeVariant: 'data', iconColor: 'bg-cyan-500' },
    ],
    comingSoon: [
      { label: 'Instagram', icon: I.instagram },
      { label: 'Facebook',  icon: I.facebook  },
      { label: 'TikTok',    icon: I.tiktok    },
      { label: 'LinkedIn',  icon: I.linkedin  },
    ],
  },
  {
    title: 'Ventas',
    collapsible: true,
    items: [
      { href: '/ventas/bandeja',          label: 'Bandeja de entrada', icon: I.inbox,     iconColor: 'bg-violet-500' },
      { href: '/ventas/vision',           label: 'Visión Ventas',      icon: I.vision,    iconColor: 'bg-orange-500' },
      { href: '/ventas/empresas',         label: 'Empresas',           icon: I.building,  iconColor: 'bg-amber-500'  },
      { href: '/ventas/contactos',        label: 'Contactos',          icon: I.contacts,  iconColor: 'bg-yellow-500' },
      { href: '/ventas/leads-relevantes', label: 'Leads Relevantes',   icon: I.leads,     iconColor: 'bg-rose-500'   },
      { href: '/ventas/propuestas',       label: 'Propuestas',         icon: I.proposals, iconColor: 'bg-red-500'    },
      { href: '/ventas/pedidos',          label: 'Pedidos',            icon: I.orders,    iconColor: 'bg-pink-500'   },
      { href: '/ventas/clientes',         label: 'Clientes',           icon: I.clients,   iconColor: 'bg-fuchsia-500'},
    ],
  },
  {
    title: 'Proyectos',
    collapsible: true,
    items: [
      { href: '/proyectos', label: 'Proyectos', icon: I.projects, iconColor: 'bg-teal-500' },
    ],
  },
  {
    title: 'Configuración',
    collapsible: true,
    items: [
      { href: '/perfil',                       label: 'Mi perfil',    icon: I.user,     iconColor: 'bg-slate-500' },
      { href: '/configuracion/organizacion',   label: 'Organización', icon: I.settings, iconColor: 'bg-slate-500' },
      { href: '/configuracion/equipo',         label: 'Equipo',       icon: I.settings, iconColor: 'bg-slate-500' },
      { href: '/configuracion/integraciones',  label: 'Integraciones',icon: I.settings, iconColor: 'bg-slate-500' },
    ],
  },
]

// ─── NavLink (full mode) ─────────────────────────────────────────────────────

function NavLink({ href, label, icon, badge, badgeVariant, iconColor }: NavItem) {
  const pathname = usePathname()
  const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))

  const badgeEl = badge ? (
    badgeVariant === 'live' ? (
      <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/25 text-emerald-400 tracking-wider">
        <span className="w-1 h-1 rounded-full bg-emerald-400" />
        {badge}
      </span>
    ) : (
      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-white/[0.07] text-slate-500 tracking-wider">
        {badge}
      </span>
    )
  ) : null

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-[12.5px] transition-all duration-150 ${
        isActive
          ? 'bg-white/[0.1] text-white font-medium'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
      }`}
    >
      <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all ${
        isActive
          ? `${iconColor ?? 'bg-slate-600'} text-white shadow-lg`
          : 'bg-white/[0.06] text-slate-500'
      }`}>
        {icon}
      </span>
      <span className="flex-1 truncate leading-none">{label}</span>
      {badgeEl}
    </Link>
  )
}

// ─── NavIcon (collapsed mode) ────────────────────────────────────────────────

function NavIcon({ href, label, icon, iconColor }: NavItem) {
  const pathname = usePathname()
  const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))

  return (
    <Link
      href={href}
      title={label}
      className={`group relative flex items-center justify-center w-9 h-9 rounded-xl mx-auto transition-all duration-150 ${
        isActive
          ? `${iconColor ?? 'bg-slate-600'} text-white shadow-lg`
          : 'bg-white/[0.06] text-slate-500 hover:bg-white/[0.12] hover:text-slate-200'
      }`}
    >
      {icon}
      {/* Tooltip on hover */}
      <span className="pointer-events-none absolute left-full ml-2.5 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl">
        {label}
      </span>
    </Link>
  )
}

// ─── NavSection ───────────────────────────────────────────────────────────────

function NavSection({ section, collapsed }: { section: NavSection; collapsed: boolean }) {
  const pathname = usePathname()
  const hasActive = section.items.some(i =>
    pathname === i.href || (i.href !== '/dashboard' && pathname.startsWith(i.href))
  )
  const [open, setOpen] = useState(hasActive || !section.collapsible)

  if (collapsed) {
    // In collapsed mode, show only icon chips (no section titles)
    return (
      <div className="space-y-1 py-1">
        {section.title && <div className="h-px bg-white/[0.05] mx-1 my-2" />}
        {section.items.map(item => <NavIcon key={item.href} {...item} />)}
      </div>
    )
  }

  return (
    <div>
      {section.title && (
        <button
          onClick={() => section.collapsible && setOpen(v => !v)}
          className="w-full flex items-center justify-between px-2.5 pt-5 pb-1.5 group"
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600">
            {section.title}
          </span>
          {section.collapsible && (
            <span className={`text-slate-700 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
              {I.chevron}
            </span>
          )}
        </button>
      )}
      {open && (
        <div className="space-y-1">
          {section.items.map(item => <NavLink key={item.href} {...item} />)}
          {section.comingSoon && section.comingSoon.map(cs => (
            <div
              key={cs.label}
              className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-[12.5px] opacity-40 cursor-not-allowed select-none"
            >
              <span className="w-6 h-6 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0 text-slate-600">
                {cs.icon}
              </span>
              <span className="flex-1 truncate leading-none text-slate-500">{cs.label}</span>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-white/[0.07] text-slate-600 tracking-wider">
                Pronto
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export default function Sidebar({
  orgName, orgId, logoSignedUrl,
  mobileOpen, onClose,
  collapsed = false,
  onToggleCollapse,
}: Props) {
  const [imgError, setImgError] = useState(false)
  const { theme, toggleTheme } = useTheme()

  const initials = orgName
    ? orgName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : 'A'
  const showLogo = !!logoSignedUrl && !imgError

  const width = collapsed ? 'w-[3.75rem]' : 'w-56'
  const mobileTx = mobileOpen ? 'translate-x-0' : '-translate-x-[calc(100%+2rem)]'

  return (
    <aside
      className={`fixed top-4 left-4 bottom-4 flex flex-col z-50 rounded-2xl overflow-hidden
        transition-all duration-300 ease-in-out
        ${width} ${mobileTx} md:translate-x-0`}
      style={{
        background: 'linear-gradient(160deg, #1e2235 0%, #161928 100%)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.04) inset',
      }}
    >
      {/* ── Brand block ─────────────────────────────────────── */}
      <div className="shrink-0 px-3 py-4">
        {collapsed ? (
          /* Collapsed: just the logo centered */
          <div className="flex justify-center">
            <div className="w-9 h-9 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center border border-white/10">
              {showLogo ? (
                <img src={logoSignedUrl} alt={orgName ?? 'Logo'} className="w-full h-full object-cover" onError={() => setImgError(true)} />
              ) : (
                <span className="text-white text-sm font-bold">{initials}</span>
              )}
            </div>
          </div>
        ) : (
          /* Expanded: logo + name + close (mobile) */
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 bg-white/10 flex items-center justify-center border border-white/10">
              {showLogo ? (
                <img src={logoSignedUrl} alt={orgName ?? 'Logo'} className="w-full h-full object-cover" onError={() => setImgError(true)} />
              ) : (
                <span className="text-white text-sm font-bold">{initials}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-[13px] font-semibold truncate leading-tight">
                {orgName ?? 'Antuario'}
              </p>
              <p className="text-slate-500 text-[10px] mt-0.5">Dashboard V1</p>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="md:hidden shrink-0 w-7 h-7 rounded-lg bg-white/[0.08] flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.15] transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Divider ─────────────────────────────────────────── */}
      <div className="mx-3 h-px bg-white/[0.06]" />

      {/* ── Scrollable nav ──────────────────────────────────── */}
      <nav className={`flex-1 overflow-y-auto py-2 space-y-0 ${collapsed ? 'px-1.5' : 'px-2.5 space-y-1'}`}>
        {NAV.map((section, i) => (
          <NavSection key={i} section={section} collapsed={collapsed} />
        ))}
      </nav>

      {/* ── Divider ─────────────────────────────────────────── */}
      <div className="mx-3 h-px bg-white/[0.06]" />

      {/* ── Bottom block ────────────────────────────────────── */}
      <div className={`shrink-0 py-3 space-y-1 ${collapsed ? 'px-1.5' : 'px-2.5'}`}>

        {/* Dark / Light toggle */}
        {collapsed ? (
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className="flex items-center justify-center w-9 h-9 rounded-xl mx-auto bg-white/[0.06] text-slate-400 hover:text-yellow-300 hover:bg-white/[0.12] transition-all"
          >
            {theme === 'dark' ? I.sun : I.moon}
          </button>
        ) : (
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-[12.5px] text-slate-400 hover:text-yellow-300 hover:bg-white/[0.05] transition-all duration-150"
          >
            <span className="w-6 h-6 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
              {theme === 'dark' ? I.sun : I.moon}
            </span>
            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </button>
        )}

        {/* Profile */}
        {collapsed ? (
          <Link href="/perfil" title="Mi perfil" className="flex items-center justify-center w-9 h-9 rounded-xl mx-auto bg-white/[0.06] text-slate-500 hover:text-slate-300 hover:bg-white/[0.12] transition-all">
            {I.user}
          </Link>
        ) : (
          <Link
            href="/perfil"
            className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-[12.5px] text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-all duration-150 group"
          >
            <span className="w-6 h-6 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0 text-slate-500 group-hover:text-slate-400 transition-colors">
              {I.user}
            </span>
            Mi perfil
          </Link>
        )}

        {/* Logout */}
        {collapsed ? (
          <form action="/auth/signout" method="post">
            <button type="submit" title="Cerrar sesión" className="flex items-center justify-center w-9 h-9 rounded-xl mx-auto bg-white/[0.06] text-slate-500 hover:text-red-400 hover:bg-red-500/[0.12] transition-all">
              {I.logout}
            </button>
          </form>
        ) : (
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-[12.5px] text-slate-500 hover:text-red-400 hover:bg-red-500/[0.08] transition-all duration-150 group"
            >
              <span className="w-6 h-6 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0 group-hover:text-red-400 transition-colors">
                {I.logout}
              </span>
              Cerrar sesión
            </button>
          </form>
        )}

        {/* Collapse toggle (desktop only) */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            className={`hidden md:flex items-center ${collapsed ? 'justify-center w-9 h-9 mx-auto' : 'gap-2.5 px-2.5 py-2.5 w-full'} rounded-xl text-[12.5px] text-slate-600 hover:text-slate-300 hover:bg-white/[0.05] transition-all duration-150`}
          >
            <span className={`${collapsed ? '' : 'w-6 h-6 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0'}`}>
              {collapsed ? I.chevronRight : I.chevronLeft}
            </span>
            {!collapsed && <span>Colapsar</span>}
          </button>
        )}

      </div>
    </aside>
  )
}

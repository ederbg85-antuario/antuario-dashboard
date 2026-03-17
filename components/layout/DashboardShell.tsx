'use client'

import { useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MobileBottomNav from './MobileBottomNav'

type Props = {
  children: React.ReactNode
  orgName: string
  orgId: number
  logoSignedUrl: string | null
  userName: string
  avatarUrl: string | null
}

export default function DashboardShell({
  children,
  orgName,
  orgId,
  logoSignedUrl,
  userName,
  avatarUrl,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [topbarCollapsed, setTopbarCollapsed] = useState(false)

  // Persist sidebar collapsed state
  useEffect(() => {
    const stored = localStorage.getItem('antuario-sidebar-collapsed')
    if (stored === 'true') setSidebarCollapsed(true)
  }, [])
  useEffect(() => {
    localStorage.setItem('antuario-sidebar-collapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

  // When sidebar expands/collapses, close mobile drawer
  const toggleSidebar = () => setSidebarCollapsed(v => !v)

  // Main margin: desktop only (mobile has no sidebar offset)
  const mainMargin = sidebarCollapsed ? 'md:ml-[4.5rem]' : 'md:ml-[16rem]'
  const topbarLeft  = sidebarCollapsed ? 'md:left-[4.5rem]' : 'md:left-[16rem]'

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-[#0d1117] overflow-hidden transition-colors duration-200">

      {/* ── Mobile backdrop overlay ─────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          style={{ backdropFilter: 'blur(2px)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ────────────────────────────────────────── */}
      <Sidebar
        orgName={orgName}
        orgId={orgId}
        logoSignedUrl={logoSignedUrl}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />

      {/* ── Main area ──────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col ${mainMargin} overflow-hidden transition-all duration-300`}>
        <Topbar
          userName={userName}
          avatarUrl={avatarUrl}
          showDateFilter={true}
          onMenuClick={() => setMobileOpen(v => !v)}
          collapsed={topbarCollapsed}
          onToggleCollapse={() => setTopbarCollapsed(v => !v)}
          topbarLeft={topbarLeft}
        />
        {/* pt adjusts for topbar height; pb-20 on mobile for bottom nav */}
        <main className={`flex-1 overflow-y-auto pb-20 md:pb-0 transition-all duration-300 ${topbarCollapsed ? 'pt-4' : 'pt-20'}`}>
          {children}
        </main>

        {/* Floating "show topbar" button when collapsed */}
        {topbarCollapsed && (
          <button
            onClick={() => setTopbarCollapsed(false)}
            className="fixed top-3 right-4 z-50 h-8 px-3 flex items-center gap-1.5 rounded-full text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
            style={{
              background: 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1), 0 0 0 1px rgba(148,163,184,0.15)',
            }}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            Mostrar barra
          </button>
        )}
      </div>

      {/* ── Mobile bottom nav ──────────────────────────────── */}
      <MobileBottomNav onMenuClick={() => setMobileOpen(v => !v)} />

    </div>
  )
}

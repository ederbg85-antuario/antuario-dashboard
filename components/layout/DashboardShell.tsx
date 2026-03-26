'use client'

import { useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MobileBottomNav from './MobileBottomNav'
import { LayoutContext } from '@/providers/LayoutContext'

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
  const [fullscreen, setFullscreen] = useState(false)

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

  // Fullscreen: hide ESC key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreen) setFullscreen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [fullscreen])

  // ── Layout values depending on mode ──────────────────────────────────────────
  // Sidebar: left-4 (1rem) + expanded w-56 (14rem) = right edge at 15rem
  //   → main margin 16rem gives a 1rem gap ✓
  // Sidebar collapsed: left-4 (1rem) + w-[3.75rem] = right edge at 4.75rem
  //   → main margin 5.75rem gives a 1rem gap ✓ (was 4.5rem — caused overlap)
  const mainMargin = fullscreen
    ? ''
    : sidebarCollapsed
      ? 'md:ml-[5.75rem]'
      : 'md:ml-[16rem]'

  const topbarLeft = fullscreen
    ? ''
    : sidebarCollapsed
      ? 'md:left-[5.75rem]'
      : 'md:left-[16rem]'

  // In fullscreen mode both panels are hidden → very small top padding
  const effectiveTopbarCollapsed = fullscreen ? true : topbarCollapsed
  const mainPt = effectiveTopbarCollapsed ? 'pt-4' : 'pt-20'

  return (
    <LayoutContext.Provider value={{ topbarCollapsed: effectiveTopbarCollapsed, sidebarCollapsed, fullscreen, setFullscreen }}>
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
        {!fullscreen && (
          <Sidebar
            orgName={orgName}
            orgId={orgId}
            logoSignedUrl={logoSignedUrl}
            mobileOpen={mobileOpen}
            onClose={() => setMobileOpen(false)}
            collapsed={sidebarCollapsed}
            onToggleCollapse={toggleSidebar}
          />
        )}

        {/* ── Main area ──────────────────────────────────────── */}
        <div className={`flex-1 flex flex-col ${mainMargin} overflow-hidden transition-all duration-300`}>
          {!fullscreen && (
            <Topbar
              userName={userName}
              avatarUrl={avatarUrl}
              showDateFilter={true}
              onMenuClick={() => setMobileOpen(v => !v)}
              collapsed={topbarCollapsed}
              onToggleCollapse={() => setTopbarCollapsed(v => !v)}
              topbarLeft={topbarLeft}
              onFullscreen={() => setFullscreen(true)}
            />
          )}

          {/* pt adjusts for topbar height; pb-20 on mobile for bottom nav */}
          <main className={`flex-1 overflow-y-auto ${fullscreen ? 'pb-0 pt-1' : `pb-20 md:pb-0 ${mainPt}`} transition-all duration-300`}>
            {children}
          </main>

          {/* Floating "show topbar" button when collapsed (not fullscreen) */}
          {topbarCollapsed && !fullscreen && (
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
        {!fullscreen && <MobileBottomNav onMenuClick={() => setMobileOpen(v => !v)} />}

        {/* ── Fullscreen exit button ──────────────────────────── */}
        {fullscreen && (
          <button
            onClick={() => setFullscreen(false)}
            title="Salir de pantalla completa (Esc)"
            className="fixed top-3 right-4 z-[100] flex items-center gap-2 h-8 px-3 rounded-full text-xs font-medium transition-all"
            style={{
              background: 'rgba(15,20,30,0.75)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.7)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.color = 'white'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)'
            }}
          >
            {/* compress / exit-fullscreen icon */}
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0h5m-5 0v5M15 9l5-5m0 0h-5m5 0v5M9 15l-5 5m0 0h5m-5 0v-5M15 15l5 5m0 0h-5m5 0v-5" />
            </svg>
            Salir (Esc)
          </button>
        )}

      </div>
    </LayoutContext.Provider>
  )
}

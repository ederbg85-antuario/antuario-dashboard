'use client'

import { useState } from 'react'
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

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">

      {/* ── Mobile backdrop overlay ─────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          style={{ backdropFilter: 'blur(2px)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar (desktop: always visible; mobile: drawer) ── */}
      <Sidebar
        orgName={orgName}
        orgId={orgId}
        logoSignedUrl={logoSignedUrl}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      {/* ── Main area ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col md:ml-[16rem] overflow-hidden">
        <Topbar
          userName={userName}
          avatarUrl={avatarUrl}
          showDateFilter={true}
          onMenuClick={() => setMobileOpen(v => !v)}
        />
        {/* pb-20 on mobile for bottom nav clearance */}
        <main className="flex-1 overflow-y-auto pt-20 pb-20 md:pb-0">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ──────────────────────────────── */}
      <MobileBottomNav onMenuClick={() => setMobileOpen(v => !v)} />

    </div>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  DateFilter, DatePreset, PRESET_LABELS, PRESET_ORDER,
  computeDateRange, formatDateRange,
  getDateFilterClient, setDateFilterClient,
} from '@/lib/date-filter'

export default function DateFilterBar() {
  const router = useRouter()
  const [filter, setFilter] = useState<DateFilter>(getDateFilterClient)
  const [open, setOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState(filter.from)
  const [customTo, setCustomTo] = useState(filter.to)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const applyFilter = (newFilter: DateFilter) => {
    setFilter(newFilter)
    setDateFilterClient(newFilter)
    setOpen(false)
    router.refresh()
  }

  const handlePresetClick = (preset: DatePreset) => {
    if (preset === 'custom') return
    const { from, to } = computeDateRange(preset)
    applyFilter({ preset, from, to })
  }

  const handleCustomApply = () => {
    if (!customFrom || !customTo || customFrom > customTo) return
    applyFilter({ preset: 'custom', from: customFrom, to: customTo })
  }

  return (
    <div className="relative" ref={ref}>
      <style>{`
        :root  { --df-bg: rgba(255,255,255,0.9); --df-shadow: 0 2px 8px rgba(0,0,0,0.08),0 1px 0 rgba(255,255,255,0.9) inset,0 0 0 1px rgba(148,163,184,0.2); --df-text: #334155; }
        .dark  { --df-bg: rgba(30,35,50,0.95);   --df-shadow: 0 2px 8px rgba(0,0,0,0.3),0 0 0 1px rgba(255,255,255,0.07);                                     --df-text: #cbd5e1; }
      `}</style>

      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all min-w-[150px] md:min-w-[170px]"
        style={{ background: 'var(--df-bg)', boxShadow: 'var(--df-shadow)', color: 'var(--df-text)' }}
      >
        <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="flex-1 text-left truncate text-xs md:text-sm">{formatDateRange(filter)}</span>
        <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 rounded-2xl w-72 overflow-hidden"
          style={{ background: 'var(--df-bg)', boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(148,163,184,0.15)' }}
        >
          {/* Presets */}
          <div className="p-2">
            {PRESET_ORDER.filter(p => p !== 'custom').map(preset => (
              <button
                key={preset}
                onClick={() => handlePresetClick(preset)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  filter.preset === preset
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-medium'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.07]'
                }`}
              >
                {PRESET_LABELS[preset]}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100 dark:border-white/[0.06] mx-2" />

          {/* Custom range */}
          <div className="p-3">
            <p className={`text-xs font-semibold mb-2 ${filter.preset === 'custom' ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
              Periodo personalizado
            </p>
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <label className="text-xs text-slate-400 dark:text-slate-500 mb-1 block">Desde</label>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full text-xs border border-slate-200 dark:border-white/[0.1] rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 bg-white dark:bg-white/[0.06] focus:outline-none focus:border-slate-400 dark:focus:border-slate-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-400 dark:text-slate-500 mb-1 block">Hasta</label>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full text-xs border border-slate-200 dark:border-white/[0.1] rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 bg-white dark:bg-white/[0.06] focus:outline-none focus:border-slate-400 dark:focus:border-slate-500"
                />
              </div>
            </div>
            <button
              onClick={handleCustomApply}
              disabled={!customFrom || !customTo || customFrom > customTo}
              className="w-full bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium py-2 rounded-lg transition-colors disabled:opacity-40"
            >
              Aplicar periodo
            </button>
          </div>

          {filter.preset !== 'custom' && (
            <div className="px-3 pb-3">
              <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
                {new Date(filter.from).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                {'  '}
                {new Date(filter.to).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

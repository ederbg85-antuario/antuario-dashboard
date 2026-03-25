'use client'

import { useState } from 'react'
import type { ReactElement } from 'react'
import { useRouter } from 'next/navigation'

type Account = {
  id:   string
  name: string
  meta: string
}

type SourceMeta = {
  label:        string
  accountLabel: string
  hint:         string
}

type Props = {
  connectionId: string
  source:       string
  sourceMeta:   SourceMeta
  accounts:     Account[]
}

const SOURCE_ICONS: Record<string, ReactElement> = {
  meta_ads: (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#1877F2"/>
      <path d="M13 8h-1.5C10.67 8 10 8.67 10 9.5V11H8v2.5h2V19h2.5v-5.5H15l.5-2.5h-2.5V9.5c0-.28.22-.5.5-.5H15V8h-2z" fill="white"/>
    </svg>
  ),
  facebook: (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="6" fill="#1877F2"/>
      <path d="M13 8h-1.5C10.67 8 10 8.67 10 9.5V11H8v2.5h2V19h2.5v-5.5H15l.5-2.5h-2.5V9.5c0-.28.22-.5.5-.5H15V8h-2z" fill="white"/>
    </svg>
  ),
  instagram: (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FD5949"/>
          <stop offset="50%" stopColor="#D6249F"/>
          <stop offset="100%" stopColor="#285AEB"/>
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#ig-grad)"/>
      <rect x="6" y="6" width="12" height="12" rx="3.5" stroke="white" strokeWidth="1.5" fill="none"/>
      <circle cx="12" cy="12" r="3" stroke="white" strokeWidth="1.5" fill="none"/>
      <circle cx="16" cy="8" r="0.8" fill="white"/>
    </svg>
  ),
}

const DASHBOARD_MAP: Record<string, string> = {
  meta_ads:  '/marketing/meta',
  facebook:  '/marketing/facebook',
  instagram: '/marketing/instagram',
}

export default function MetaCuentaSelectorClient({
  connectionId, source, sourceMeta, accounts,
}: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(
    accounts.length === 1 ? accounts[0].id : null
  )
  const [selectedName, setSelectedName] = useState<string | null>(
    accounts.length === 1 ? accounts[0].name : null
  )
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const handleSelect = (account: Account) => {
    setSelected(account.id)
    setSelectedName(account.name)
  }

  const handleConfirm = async () => {
    if (!selected) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/oauth/meta/confirmar', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          connection_id: connectionId,
          account_id:    selected,
          account_name:  selectedName ?? selected,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.message ?? 'Error al guardar la conexi�n')
        setLoading(false)
        return
      }

      // Redirigir al dashboard de Meta correspondiente
      const dest = DASHBOARD_MAP[source] ?? '/configuracion/integraciones'
      router.push(`${dest}?connected=${source}`)

    } catch {
      setError('Error de conexi�n. Intenta de nuevo.')
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    await fetch('/api/oauth/meta/confirmar', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ connection_id: connectionId }),
    })
    router.push('/configuracion/integraciones')
  }

  const icon = SOURCE_ICONS[source]

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-lg">

        {/* Header */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              {icon ?? <span className="text-xl">�</span>}
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                Conectar integraci�n
              </p>
              <h1 className="text-lg font-bold text-slate-900">{sourceMeta.label}</h1>
            </div>
          </div>
          <p className="text-sm text-slate-500">{sourceMeta.hint}</p>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-sm font-semibold text-slate-700 mb-3">
            {sourceMeta.accountLabel}
          </p>

          {accounts.length === 0 ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-5 text-center">
              <p className="text-sm font-medium text-amber-800 mb-1">
                No se encontraron cuentas disponibles
              </p>
              <p className="text-xs text-amber-600">
                Aseg�rate de que tu cuenta de Facebook tiene acceso de administrador a {sourceMeta.label}.
                Si acabas de crear la cuenta, espera unos minutos e intenta de nuevo.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {accounts.map(account => (
                <button
                  key={account.id}
                  onClick={() => handleSelect(account)}
                  className={`w-full text-left rounded-xl border p-4 transition-all ${
                    selected === account.id
                      ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {account.name}
                      </p>
                      {account.meta && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{account.meta}</p>
                      )}
                      <p className="text-xs text-slate-300 mt-0.5 font-mono truncate">{account.id}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      selected === account.id
                        ? 'border-slate-900 bg-slate-900'
                        : 'border-slate-300'
                    }`}>
                      {selected === account.id && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-0 flex gap-3">
          <button
            onClick={handleCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {loading ? 'Conectando&' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

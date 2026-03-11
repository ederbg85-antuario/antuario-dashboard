'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Property = {
  id:   string
  name: string
  meta: string
}

type SourceMeta = {
  label:         string
  propertyLabel: string
  hint:          string
}

type Props = {
  connectionId: string
  source:       string
  sourceMeta:   SourceMeta
  properties:   Property[]
}

const SOURCE_ICONS: Record<string, string> = {
  ga4:            '◉',
  search_console: '◎',
  google_ads:     '◆',
  gmb:            '◍',
}

export default function PropiedadSelectorClient({
  connectionId, source, sourceMeta, properties,
}: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(
    properties.length === 1 ? properties[0].id : null
  )
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const handleConfirm = async () => {
    if (!selected) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/oauth/google/confirmar', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ connection_id: connectionId, property_id: selected }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.message ?? 'Error al guardar la conexión')
        setLoading(false)
        return
      }

      // Redirigir al dashboard correspondiente
      const dashboardMap: Record<string, string> = {
        ga4:            '/marketing/web',
        search_console: '/marketing/seo',
        google_ads:     '/marketing/ads',
        gmb:            '/marketing/gmb',
      }
      router.push(`${dashboardMap[source] ?? '/configuracion/integraciones'}?connected=${source}`)

    } catch {
      setError('Error de conexión. Intenta de nuevo.')
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    // Limpiar la conexión pending
    await fetch('/api/oauth/google/confirmar', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ connection_id: connectionId }),
    })
    router.push('/configuracion/integraciones')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-lg">

        {/* Header */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl">
              {SOURCE_ICONS[source] ?? '◈'}
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                Conectar integración
              </p>
              <h1 className="text-lg font-bold text-slate-900">{sourceMeta.label}</h1>
            </div>
          </div>
          <p className="text-sm text-slate-500">{sourceMeta.hint}</p>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-sm font-semibold text-slate-700 mb-3">
            {sourceMeta.propertyLabel}
          </p>

          {properties.length === 0 ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-5 text-center">
              <p className="text-sm font-medium text-amber-800 mb-1">
                No se encontraron propiedades disponibles
              </p>
              <p className="text-xs text-amber-600">
                Asegúrate de que la cuenta de Google que conectaste tiene acceso
                a {sourceMeta.label}. Puede tardar unos minutos en sincronizarse.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {properties.map(prop => (
                <button
                  key={prop.id}
                  onClick={() => setSelected(prop.id)}
                  className={`w-full text-left rounded-xl border p-4 transition-all ${
                    selected === prop.id
                      ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {prop.name}
                      </p>
                      {prop.meta && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{prop.meta}</p>
                      )}
                      <p className="text-xs text-slate-300 mt-0.5 font-mono truncate">{prop.id}</p>
                    </div>
                    {/* Radio visual */}
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      selected === prop.id
                        ? 'border-slate-900 bg-slate-900'
                        : 'border-slate-300'
                    }`}>
                      {selected === prop.id && (
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
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            onClick={handleCancel}
            disabled={loading}
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50">
            Cancelar
          </button>

          <button
            onClick={handleConfirm}
            disabled={!selected || loading || properties.length === 0}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-6 py-2.5 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Conectando...
              </>
            ) : (
              'Conectar esta propiedad →'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import LogoUploader from '@/components/common/LogoUploader'

type Props = {
  orgId: number
  orgName: string | null
  logoPath: string | null
  logoSignedUrl: string | null
}

function getSB() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export default function OrganizacionClient({ orgId, orgName, logoPath, logoSignedUrl }: Props) {
  const [name,       setName]       = useState(orgName ?? '')
  const [saving,     setSaving]     = useState(false)
  const [success,    setSuccess]    = useState(false)
  const [error,      setError]      = useState('')
  const [currentLogoPath, setCurrentLogoPath] = useState(logoPath)

  const handleSave = useCallback(async () => {
    if (!name.trim()) return
    setSaving(true)
    setError('')
    setSuccess(false)

    const { error: err } = await getSB()
      .from('organizations')
      .update({ name: name.trim() })
      .eq('id', orgId)

    setSaving(false)
    if (err) { setError(err.message); return }
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }, [name, orgId])

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Organización</h1>
        <p className="text-sm text-slate-400 mt-0.5">Información y logo de tu organización</p>
      </div>

      {/* Logo section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-5">Logo</h2>
        <LogoUploader
          orgId={orgId}
          orgName={name || orgName}
          currentLogoUrl={logoSignedUrl}
          currentLogoPath={currentLogoPath}
          onUpdate={(_, newPath) => setCurrentLogoPath(newPath || null)}
        />
      </div>

      {/* Name section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Información general</h2>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Nombre de la organización</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nombre de tu empresa o agencia"
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        {error   && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        {success && <p className="text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">✓ Organización actualizada</p>}

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-40"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

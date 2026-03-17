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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 dark:text-white">Organización</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Información y logo de tu organización</p>
      </div>

      {/* Logo section */}
      <div className="bg-white dark:bg-[#1e2535] rounded-2xl border border-slate-200 dark:border-white/[0.08] p-6">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-200 mb-5">Logo</h2>
        <LogoUploader
          orgId={orgId}
          orgName={name || orgName}
          currentLogoUrl={logoSignedUrl}
          currentLogoPath={currentLogoPath}
          onUpdate={(_, newPath) => setCurrentLogoPath(newPath || null)}
        />
      </div>

      {/* Name section */}
      <div className="bg-white dark:bg-[#1e2535] rounded-2xl border border-slate-200 dark:border-white/[0.08] p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-200">Información general</h2>

        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Nombre de la organización</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nombre de tu empresa o agencia"
            className="w-full border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 bg-white dark:bg-[#1e2535] dark:bg-[#0d1117]"
          />
        </div>

        {error   && <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
        {success && <p className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 dark:bg-emerald-900/20 px-3 py-2 rounded-lg">✓ Organización actualizada</p>}

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

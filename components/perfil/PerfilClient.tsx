'use client'

import { useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import AvatarUploader from '@/components/common/AvatarUploader'

type Props = {
  userId: string
  fullName: string | null
  email: string | null
  avatarPath: string | null
  avatarSignedUrl: string | null
}

function getSB() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export default function PerfilClient({ userId, fullName, email, avatarPath, avatarSignedUrl }: Props) {
  const [name,    setName]    = useState(fullName ?? '')
  const [saving,  setSaving]  = useState(false)
  const [success, setSuccess] = useState(false)
  const [error,   setError]   = useState('')

  const handleSave = useCallback(async () => {
    if (!name.trim()) return
    setSaving(true)
    setError('')
    setSuccess(false)

    const { error: err } = await getSB()
      .from('profiles')
      .update({ full_name: name.trim() })
      .eq('id', userId)

    setSaving(false)
    if (err) { setError(err.message); return }
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }, [name, userId])

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mi perfil</h1>
        <p className="text-sm text-slate-400 mt-0.5">Información personal y foto de perfil</p>
      </div>

      {/* Avatar section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-5">Foto de perfil</h2>
        <AvatarUploader
          userId={userId}
          currentAvatarUrl={avatarSignedUrl}
          currentAvatarPath={avatarPath}
          userName={fullName}
        />
      </div>

      {/* Name + email section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Información personal</h2>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Nombre completo</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Tu nombre completo"
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
          <input
            type="email"
            value={email ?? ''}
            disabled
            className="w-full border border-slate-100 rounded-lg px-3 py-2.5 text-sm text-slate-400 bg-slate-50 cursor-not-allowed"
          />
          <p className="text-xs text-slate-400 mt-1">El email no puede cambiarse desde aquí</p>
        </div>

        {error   && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        {success && <p className="text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">✓ Perfil actualizado correctamente</p>}

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

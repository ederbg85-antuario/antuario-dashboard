'use client'

import { useState, useRef, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

type Props = {
  orgId: number
  orgName: string | null
  currentLogoUrl: string | null     // signed URL already resolved, or null
  currentLogoPath: string | null    // raw path from organizations.logo_url
  onUpdate?: (newSignedUrl: string, newPath: string) => void
}

const BUCKET  = 'org-logos'
const MAX_MB  = 5
const MAX_B   = MAX_MB * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']

function getInitials(name: string | null) {
  if (!name) return 'A'
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function getSB() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export default function LogoUploader({ orgId, orgName, currentLogoUrl, currentLogoPath, onUpdate }: Props) {
  const [preview,   setPreview]   = useState<string | null>(currentLogoUrl)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File | null) => {
    if (!file) return
    setError('')
    setSuccess(false)

    if (!ALLOWED.includes(file.type)) {
      setError('Solo se permiten imágenes JPG, PNG, WebP o SVG')
      return
    }
    if (file.size > MAX_B) {
      setError(`El archivo supera los ${MAX_MB} MB`)
      return
    }

    // Local preview
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    setUploading(true)
    const client   = getSB()
    const fileExt  = file.name.split('.').pop()
    const path     = `${orgId}/logo.${fileExt}`

    const { error: upErr } = await client.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type })

    if (upErr) { setError(upErr.message); setUploading(false); return }

    const { error: dbErr } = await client
      .from('organizations')
      .update({ logo_url: path })
      .eq('id', orgId)

    if (dbErr) { setError(dbErr.message); setUploading(false); return }

    const { data: signed } = await client.storage.from(BUCKET).createSignedUrl(path, 3600)
    if (signed?.signedUrl) {
      setPreview(signed.signedUrl)
      onUpdate?.(signed.signedUrl, path)
    }

    setUploading(false)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }, [orgId, onUpdate])

  const handleRemove = useCallback(async () => {
    if (!currentLogoPath) return
    if (!confirm('¿Eliminar el logo de la organización?')) return
    setUploading(true)
    const client = getSB()
    await client.storage.from(BUCKET).remove([currentLogoPath])
    await client.from('organizations').update({ logo_url: null }).eq('id', orgId)
    setPreview(null)
    onUpdate?.('', '')
    setUploading(false)
  }, [currentLogoPath, orgId, onUpdate])

  const initials = getInitials(orgName)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-5">
        {/* Logo display */}
        <div className="relative group shrink-0">
          <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-slate-200 shadow-sm bg-white">
            {preview ? (
              <img src={preview} alt="Logo" className="w-full h-full object-contain p-1" />
            ) : (
              <div className="w-full h-full bg-emerald-500 flex items-center justify-center text-white text-xl font-bold">
                {initials}
              </div>
            )}
          </div>

          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
          >
            {uploading ? (
              <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/svg+xml"
            className="hidden"
            onChange={e => handleFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {/* Info + actions */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 mb-0.5 truncate">{orgName ?? 'Organización'}</p>
          <p className="text-xs text-slate-400 mb-3">JPG, PNG, WebP o SVG · Máx. {MAX_MB} MB</p>
          <div className="flex gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-40 transition-colors font-medium"
            >
              {uploading ? 'Subiendo...' : 'Subir logo'}
            </button>
            {preview && (
              <button
                onClick={handleRemove}
                disabled={uploading}
                className="text-xs text-red-400 hover:text-red-600 px-3 py-1.5 rounded-lg border border-red-100 hover:bg-red-50 disabled:opacity-40 transition-colors"
              >
                Eliminar
              </button>
            )}
          </div>
        </div>
      </div>

      {error   && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      {success && <p className="text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">✓ Logo actualizado correctamente</p>}
    </div>
  )
}

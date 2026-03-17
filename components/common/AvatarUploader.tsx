'use client'

import { useState, useRef, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

type Props = {
  userId: string
  currentAvatarUrl: string | null      // signed URL already resolved, or null
  currentAvatarPath: string | null     // raw path from profiles.avatar_url
  userName: string | null
  onUpdate?: (newSignedUrl: string) => void
}

const BUCKET  = 'avatars'
const MAX_MB  = 5
const MAX_B   = MAX_MB * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function getInitials(name: string | null) {
  if (!name) return 'U'
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

function getSB() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export default function AvatarUploader({ userId, currentAvatarUrl, currentAvatarPath, userName, onUpdate }: Props) {
  const [preview,   setPreview]   = useState<string | null>(currentAvatarUrl)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File | null) => {
    if (!file) return
    setError('')
    setSuccess(false)

    if (!ALLOWED.includes(file.type)) {
      setError('Solo se permiten imágenes JPG, PNG, WebP o GIF')
      return
    }
    if (file.size > MAX_B) {
      setError(`La imagen supera los ${MAX_MB} MB`)
      return
    }

    // Local preview
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    setUploading(true)
    const client = getSB()
    const path   = `${userId}/avatar.${file.name.split('.').pop()}`

    // Remove old file if different path
    if (currentAvatarPath && currentAvatarPath !== path) {
      await client.storage.from(BUCKET).remove([currentAvatarPath])
    }

    const { error: upErr } = await client.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type })

    if (upErr) { setError(upErr.message); setUploading(false); return }

    // Save path to profiles
    const { error: dbErr } = await client
      .from('profiles')
      .update({ avatar_url: path })
      .eq('id', userId)

    if (dbErr) { setError(dbErr.message); setUploading(false); return }

    // Get fresh signed URL and bubble up
    const { data: signed } = await client.storage.from(BUCKET).createSignedUrl(path, 3600)
    if (signed?.signedUrl) {
      setPreview(signed.signedUrl)
      onUpdate?.(signed.signedUrl)
    }

    setUploading(false)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }, [userId, currentAvatarPath, onUpdate])

  const initials = getInitials(userName)

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Avatar display */}
      <div className="relative group">
        <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-lg">
          {preview ? (
            <img src={preview} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-slate-800 flex items-center justify-center text-white text-2xl font-bold">
              {initials}
            </div>
          )}
        </div>

        {/* Overlay on hover */}
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
        >
          {uploading ? (
            <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={e => handleFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {/* Status */}
      {error && (
        <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg text-center max-w-xs">{error}</p>
      )}
      {success && (
        <p className="text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 rounded-lg text-center">
          ✓ Foto actualizada correctamente
        </p>
      )}

      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="text-sm text-slate-500 hover:text-slate-800 dark:text-slate-100 underline underline-offset-2 disabled:opacity-40 transition-colors"
      >
        {uploading ? 'Subiendo...' : 'Cambiar foto'}
      </button>

      <p className="text-xs text-slate-400">JPG, PNG o WebP · Máx. {MAX_MB} MB</p>
    </div>
  )
}

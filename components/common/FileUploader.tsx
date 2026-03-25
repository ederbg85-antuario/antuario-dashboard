'use client'

import { useState, useRef, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

export type ContactFile = {
  id: string
  contact_id: string
  organization_id: number
  file_name: string
  file_path: string | null
  file_size: number | null
  file_type: string | null
  uploaded_by: string | null
  created_at: string
}

type Props = {
  orgId: number
  contactId: string
  currentUserId: string
  initialFiles: ContactFile[]
}

const BUCKET = 'contact-files'
const MAX_MB  = 20
const MAX_B   = MAX_MB * 1024 * 1024

const FILE_ICONS: Record<string, string> = {
  pdf: '=�', doc: '=�', docx: '=�',
  xls: '=�', xlsx: '=�',
  png: '=�', jpg: '=�', jpeg: '=�', webp: '=�',
  zip: '=�', rar: '=�',
  mp4: '<�', mov: '<�',
}

const ext = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

function fmtSize(b: number | null) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 ** 2).toFixed(1)} MB`
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function getSB() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export default function FileUploader({ orgId, contactId, currentUserId, initialFiles }: Props) {
  const [files,       setFiles]       = useState<ContactFile[]>(initialFiles)
  const [uploading,   setUploading]   = useState(false)
  const [error,       setError]       = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [deleting,    setDeleting]    = useState<string | null>(null)
  const [dragOver,    setDragOver]    = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = useCallback(async (list: FileList | null) => {
    if (!list || list.length === 0) return
    setError('')
    const client = getSB()

    for (const file of Array.from(list)) {
      if (file.size > MAX_B) { setError(`"${file.name}" supera los ${MAX_MB} MB`); continue }
      setUploading(true)

      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${orgId}/${contactId}/${Date.now()}_${safe}`

      const { error: upErr } = await client.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (upErr) { setError(upErr.message); setUploading(false); continue }

      const { data: row, error: dbErr } = await client
        .from('contact_files')
        .insert({ contact_id: contactId, organization_id: orgId, file_name: file.name, file_path: path, file_size: file.size, file_type: ext(file.name), uploaded_by: currentUserId })
        .select().single()

      if (dbErr) setError(dbErr.message)
      else if (row) setFiles(p => [row, ...p])
      setUploading(false)
    }
  }, [orgId, contactId, currentUserId])

  const download = useCallback(async (f: ContactFile) => {
    if (!f.file_path) return
    setDownloading(f.id)
    const { data, error: e } = await getSB().storage.from(BUCKET).createSignedUrl(f.file_path, 3600)
    if (e || !data?.signedUrl) { setError('No se pudo generar el link'); setDownloading(null); return }
    window.open(data.signedUrl, '_blank')
    setDownloading(null)
  }, [])

  const remove = useCallback(async (f: ContactFile) => {
    if (!confirm(`�Eliminar "${f.file_name}"?`)) return
    setDeleting(f.id)
    const client = getSB()
    if (f.file_path) await client.storage.from(BUCKET).remove([f.file_path])
    await client.from('contact_files').delete().eq('id', f.id)
    setFiles(p => p.filter(x => x.id !== f.id))
    setDeleting(null)
  }, [])

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all select-none ${dragOver ? 'border-slate-500 bg-slate-50 dark:bg-[#1a2030]' : 'border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:border-white/[0.1] hover:bg-slate-50 dark:bg-[#1a2030]'}`}
      >
        <input ref={inputRef} type="file" multiple className="hidden" onChange={e => upload(e.target.files)} />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500"><Spinner />Subiendo...</div>
        ) : (
          <>
            <svg className="w-6 h-6 text-slate-300 mx-auto mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-xs text-slate-500"><span className="font-medium text-slate-700 dark:text-slate-200">Clic o arrastra</span> para subir</p>
            <p className="text-xs text-slate-400 mt-0.5">M�x. {MAX_MB} MB por archivo</p>
          </>
        )}
      </div>

      {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}

      {/* File list */}
      {files.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-2">Sin archivos adjuntos</p>
      ) : (
        <div className="space-y-1">
          {files.map(f => {
            const icon  = FILE_ICONS[ext(f.file_name)] ?? '=�'
            const isDl  = downloading === f.id
            const isDel = deleting    === f.id
            return (
              <div key={f.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 dark:border-white/[0.05] hover:border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:bg-[#1a2030] transition-all group">
                <span className="text-lg shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{f.file_name}</p>
                  <p className="text-xs text-slate-400">{fmtSize(f.file_size)} � {fmtDate(f.created_at)}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => download(f)} disabled={isDl} title="Descargar"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:bg-[#2a3448] disabled:opacity-40 transition-colors">
                    {isDl ? <Spinner className="w-3.5 h-3.5" /> : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    )}
                  </button>
                  <button onClick={() => remove(f)} disabled={isDel} title="Eliminar"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:bg-red-900/20 disabled:opacity-40 transition-colors">
                    {isDel ? <Spinner className="w-3.5 h-3.5" /> : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

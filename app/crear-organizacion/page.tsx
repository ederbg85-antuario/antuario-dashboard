'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function CrearOrganizacionPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)

  const crearEmpresa = async () => {
    setLoading(true)

    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) {
      setLoading(false)
      alert('Debes iniciar sesión')
      router.push('/login')
      return
    }

    // Importante: NO mandamos created_by desde el frontend.
    // Que lo rellene el default en DB (auth.uid()).
    const { error } = await supabase
      .from('organizations')
      .insert([{ name: name.trim(), slug: slug.trim() }])

    setLoading(false)

    if (error) {
      console.error(error)
      alert(error.message)
      return
    }

    alert('Organización creada ✅')
    router.push('/')
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/30 p-6 backdrop-blur">
        <h1 className="text-xl font-semibold">Crear empresa</h1>

        <div className="mt-6 space-y-3">
          <input
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 outline-none"
            placeholder="Nombre (ej. Antuario Test)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 outline-none"
            placeholder="Slug (ej. antuario-test)"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />

          <button
            className="w-full rounded-xl bg-white text-black py-3 font-semibold disabled:opacity-60"
            disabled={loading || !name.trim() || !slug.trim()}
            onClick={crearEmpresa}
          >
            {loading ? 'Creando…' : 'Crear empresa'}
          </button>
        </div>
      </div>
    </main>
  )
}

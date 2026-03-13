'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import AuthShell from '@/components/auth/AuthShell'

const LOGO = 'https://static.wixstatic.com/shapes/cff7e6_ceb7df677949454eb0aa2d5641d9ca75.svg'

export default function RecuperarPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    })
    if (error) { setError(error.message); setLoading(false) } else { setSent(true); setLoading(false) }
  }

  return (
    <AuthShell>
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <img src={LOGO} alt="Antuario" className="auth-logo" />
      </div>

      {sent ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '56px', height: '56px',
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            borderRadius: '18px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '20px',
            boxShadow: '0 8px 28px rgba(59,130,246,0.4)',
          }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="white">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="auth-title">Correo enviado</h1>
          <p className="auth-sub" style={{ lineHeight: 1.6, marginBottom: '28px' }}>
            Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña.
          </p>
          <Link href="/login" style={{
            display: 'inline-block', textDecoration: 'none', padding: '13px 40px',
            background: 'linear-gradient(135deg, #1AC882, #0f9e66)',
            borderRadius: '14px', color: '#fff', fontWeight: 700, fontSize: '15px',
            boxShadow: '0 4px 20px rgba(26,200,130,0.4)',
            fontFamily: 'Inter, sans-serif',
          }}>
            Volver al Login
          </Link>
        </div>
      ) : (
        <>
          <h1 className="auth-title">Recuperar contraseña</h1>
          <p className="auth-sub" style={{ marginBottom: '28px' }}>
            Ingresa tu correo y te enviaremos un enlace de recuperación
          </p>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleReset}>
            <div className="auth-field-last">
              <label className="auth-label">Correo electrónico</label>
              <input className="auth-input" type="email" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="tu@email.com"
                autoComplete="email"
                onKeyDown={e => e.key === 'Enter' && handleReset(e)} required />
            </div>
            <button type="submit" className="auth-btn" disabled={loading || !email}>
              {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
            </button>
          </form>

          <div className="auth-links">
            <span><Link href="/login" className="auth-link">← Volver al Login</Link></span>
          </div>
        </>
      )}
    </AuthShell>
  )
}

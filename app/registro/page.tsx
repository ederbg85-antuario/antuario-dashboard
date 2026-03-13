'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import AuthShell from '@/components/auth/AuthShell'

const LOGO = 'https://static.wixstatic.com/shapes/cff7e6_ceb7df677949454eb0aa2d5641d9ca75.svg'

export default function RegistroPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden'); return }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } })
    if (error) { setError(error.message); setLoading(false) } else { setSuccess(true); setLoading(false) }
  }

  if (success) {
    return (
      <AuthShell>
        <div style={{ textAlign: 'center' }}>
          <img src={LOGO} alt="Antuario" className="auth-logo" style={{ marginBottom: '28px' }} />
          <div style={{
            width: '60px', height: '60px',
            background: 'linear-gradient(135deg, #1AC882, #0f9e66)',
            borderRadius: '18px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '20px',
            boxShadow: '0 8px 28px rgba(26,200,130,0.4)',
          }}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="white">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="auth-title">¡Cuenta creada!</h2>
          <p className="auth-sub" style={{ lineHeight: 1.6, marginBottom: '28px' }}>
            Revisa tu correo y haz clic en el enlace de confirmación para activar tu cuenta.
          </p>
          <Link href="/login" style={{
            display: 'inline-block', textDecoration: 'none', padding: '13px 40px',
            background: 'linear-gradient(135deg, #1AC882, #0f9e66)',
            borderRadius: '14px', color: '#fff', fontWeight: 700, fontSize: '15px',
            boxShadow: '0 4px 20px rgba(26,200,130,0.4)',
            fontFamily: 'Inter, sans-serif',
          }}>
            Ir a Iniciar Sesión
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      {/* Logo solo */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <img src={LOGO} alt="Antuario" className="auth-logo" />
        <h1 className="auth-title">Crear cuenta</h1>
        <p className="auth-sub">Únete a Antuario y domina tus métricas</p>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={handleRegister}>
        <div className="auth-field">
          <label className="auth-label">Nombre completo</label>
          <input className="auth-input" type="text" value={name}
            onChange={e => setName(e.target.value)} placeholder="Tu nombre"
            autoComplete="name" required />
        </div>
        <div className="auth-field">
          <label className="auth-label">Correo electrónico</label>
          <input className="auth-input" type="email" value={email}
            onChange={e => setEmail(e.target.value)} placeholder="tu@email.com"
            autoComplete="email" required />
        </div>
        <div className="auth-field">
          <label className="auth-label">Contraseña</label>
          <input className="auth-input" type="password" value={password}
            onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres"
            autoComplete="new-password" required />
        </div>
        <div className="auth-field-last">
          <label className="auth-label">Confirmar contraseña</label>
          <input className="auth-input" type="password" value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)} placeholder="Repite tu contraseña"
            autoComplete="new-password"
            onKeyDown={e => e.key === 'Enter' && handleRegister(e)} required />
        </div>

        <button type="submit" className="auth-btn"
          disabled={loading || !email || !password || !name || !confirmPassword}>
          {loading ? 'Creando cuenta...' : 'Crear Cuenta'}
        </button>
      </form>

      <div className="auth-links">
        <span>¿Ya tienes cuenta?{' '}<Link href="/login" className="auth-link">Iniciar Sesión</Link></span>
      </div>
    </AuthShell>
  )
}

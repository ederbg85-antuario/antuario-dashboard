'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AuthShell from '@/components/auth/AuthShell'

const LOGO = 'https://static.wixstatic.com/shapes/cff7e6_ceb7df677949454eb0aa2d5641d9ca75.svg'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <AuthShell>
      {/* Logo — minimalista, solo el SVG en blanco */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <img src={LOGO} alt="Antuario" className="auth-logo" />
        <h1 className="auth-title">Bienvenido de nuevo</h1>
        <p className="auth-sub">Inicia sesión para acceder a tu dashboard</p>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={handleLogin}>
        <div className="auth-field">
          <label className="auth-label">Correo electrónico</label>
          <input
            className="auth-input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tu@email.com"
            autoComplete="email"
            required
          />
        </div>

        <div className="auth-field-last" style={{ position: 'relative' }}>
          <label className="auth-label">Contraseña</label>
          <input
            className="auth-input"
            type={showPwd ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            onKeyDown={e => e.key === 'Enter' && handleLogin(e)}
            required
            style={{ paddingRight: '44px' }}
          />
          <button type="button" onClick={() => setShowPwd(v => !v)} className="auth-eye">
            {showPwd
              ? <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
              : <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            }
          </button>
        </div>

        {/* Forgot */}
        <div style={{ textAlign: 'right', marginTop: '-12px', marginBottom: '22px' }}>
          <Link href="/recuperar" className="auth-link" style={{ fontSize: '13px', fontWeight: 500 }}>
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <button type="submit" className="auth-btn" disabled={loading || !email || !password}>
          {loading ? 'Ingresando...' : 'Iniciar Sesión'}
        </button>
      </form>

      <div className="auth-links">
        <span>
          ¿No tienes cuenta?{' '}
          <Link href="/registro" className="auth-link">Crear cuenta gratis</Link>
        </span>
      </div>
    </AuthShell>
  )
}

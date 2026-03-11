'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos'
          : error.message
      )
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e2030 0%, #2a2d45 50%, #1e2030 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      padding: '20px',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '28px',
        padding: '48px 40px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 25px 60px rgba(0,0,0,0.3), 0 8px 20px rgba(0,0,0,0.2)',
      }}>
        {/* Logo / Brand */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            background: 'linear-gradient(135deg, #1A9E76, #15B886)',
            borderRadius: '16px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            boxShadow: '0 8px 24px rgba(26,158,118,0.3)',
          }}>
            <span style={{ color: '#fff', fontSize: '24px', fontWeight: 800 }}>A</span>
          </div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 800,
            color: '#1e2030',
            letterSpacing: '-0.03em',
            margin: '0 0 4px 0',
          }}>
            Antuario Dashboard
          </h1>
          <p style={{ color: '#8b8fa3', fontSize: '14px', margin: 0 }}>
            Inicia sesión para continuar
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div style={{
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '20px',
            color: '#DC2626',
            fontSize: '13px',
            fontWeight: 500,
          }}>
            {error}
          </div>
        )}

        {/* Form */}
        <div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 600,
              color: '#4a4e69',
              marginBottom: '6px',
            }}>
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1.5px solid #e2e4ea',
                fontSize: '14px',
                fontFamily: "'DM Sans', sans-serif",
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => e.target.style.borderColor = '#1A9E76'}
              onBlur={(e) => e.target.style.borderColor = '#e2e4ea'}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 600,
              color: '#4a4e69',
              marginBottom: '6px',
            }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin(e)}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1.5px solid #e2e4ea',
                fontSize: '14px',
                fontFamily: "'DM Sans', sans-serif",
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => e.target.style.borderColor = '#1A9E76'}
              onBlur={(e) => e.target.style.borderColor = '#e2e4ea'}
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading || !email || !password}
            style={{
              width: '100%',
              padding: '14px',
              background: loading ? '#8b8fa3' : 'linear-gradient(135deg, #1A9E76, #15B886)',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              fontSize: '15px',
              fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              cursor: loading ? 'wait' : 'pointer',
              boxShadow: '0 4px 14px rgba(26,158,118,0.3)',
              transition: 'all 0.3s',
              opacity: (!email || !password) ? 0.5 : 1,
            }}
          >
            {loading ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </div>

        {/* Links */}
        <div style={{
          marginTop: '24px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <Link
            href="/recuperar"
            style={{
              color: '#8b8fa3',
              fontSize: '13px',
              textDecoration: 'none',
            }}
          >
            ¿Olvidaste tu contraseña?
          </Link>
          <div style={{ fontSize: '13px', color: '#8b8fa3' }}>
            ¿No tienes cuenta?{' '}
            <Link
              href="/registro"
              style={{
                color: '#1A9E76',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

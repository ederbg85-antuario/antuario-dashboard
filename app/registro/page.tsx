'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

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

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setLoading(false)
    }
  }

  if (success) {
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
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
          textAlign: 'center',
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            background: 'linear-gradient(135deg, #1A9E76, #15B886)',
            borderRadius: '16px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
          }}>
            <span style={{ color: '#fff', fontSize: '28px' }}>✓</span>
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1e2030', marginBottom: '8px' }}>
            ¡Cuenta creada!
          </h2>
          <p style={{ color: '#8b8fa3', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
            Revisa tu correo electrónico y haz clic en el enlace de confirmación para activar tu cuenta.
          </p>
          <Link
            href="/login"
            style={{
              display: 'inline-block',
              padding: '12px 32px',
              background: 'linear-gradient(135deg, #1A9E76, #15B886)',
              color: '#fff',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 700,
              textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(26,158,118,0.3)',
            }}
          >
            Ir a Iniciar Sesión
          </Link>
        </div>
      </div>
    )
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
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
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
            Crear Cuenta
          </h1>
          <p style={{ color: '#8b8fa3', fontSize: '14px', margin: 0 }}>
            Regístrate en Antuario Dashboard
          </p>
        </div>

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

        <div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4a4e69', marginBottom: '6px' }}>
              Nombre completo
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
              style={{
                width: '100%', padding: '12px 16px', borderRadius: '12px',
                border: '1.5px solid #e2e4ea', fontSize: '14px',
                fontFamily: "'DM Sans', sans-serif", outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => e.target.style.borderColor = '#1A9E76'}
              onBlur={(e) => e.target.style.borderColor = '#e2e4ea'}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4a4e69', marginBottom: '6px' }}>
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              style={{
                width: '100%', padding: '12px 16px', borderRadius: '12px',
                border: '1.5px solid #e2e4ea', fontSize: '14px',
                fontFamily: "'DM Sans', sans-serif", outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => e.target.style.borderColor = '#1A9E76'}
              onBlur={(e) => e.target.style.borderColor = '#e2e4ea'}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4a4e69', marginBottom: '6px' }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              style={{
                width: '100%', padding: '12px 16px', borderRadius: '12px',
                border: '1.5px solid #e2e4ea', fontSize: '14px',
                fontFamily: "'DM Sans', sans-serif", outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => e.target.style.borderColor = '#1A9E76'}
              onBlur={(e) => e.target.style.borderColor = '#e2e4ea'}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4a4e69', marginBottom: '6px' }}>
              Confirmar contraseña
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite tu contraseña"
              onKeyDown={(e) => e.key === 'Enter' && handleRegister(e)}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: '12px',
                border: '1.5px solid #e2e4ea', fontSize: '14px',
                fontFamily: "'DM Sans', sans-serif", outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => e.target.style.borderColor = '#1A9E76'}
              onBlur={(e) => e.target.style.borderColor = '#e2e4ea'}
            />
          </div>

          <button
            onClick={handleRegister}
            disabled={loading || !email || !password || !name}
            style={{
              width: '100%', padding: '14px',
              background: loading ? '#8b8fa3' : 'linear-gradient(135deg, #1A9E76, #15B886)',
              color: '#fff', border: 'none', borderRadius: '12px',
              fontSize: '15px', fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
              cursor: loading ? 'wait' : 'pointer',
              boxShadow: '0 4px 14px rgba(26,158,118,0.3)',
              opacity: (!email || !password || !name) ? 0.5 : 1,
            }}
          >
            {loading ? 'Creando cuenta...' : 'Crear Cuenta'}
          </button>
        </div>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '13px', color: '#8b8fa3' }}>
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" style={{ color: '#1A9E76', fontWeight: 600, textDecoration: 'none' }}>
            Iniciar Sesión
          </Link>
        </div>
      </div>
    </div>
  )
}

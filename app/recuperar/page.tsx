'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

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

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
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
        boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
        textAlign: 'center',
      }}>
        <div style={{
          width: '56px', height: '56px',
          background: 'linear-gradient(135deg, #1A9E76, #15B886)',
          borderRadius: '16px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '20px',
          boxShadow: '0 8px 24px rgba(26,158,118,0.3)',
        }}>
          <span style={{ color: '#fff', fontSize: '24px', fontWeight: 800 }}>A</span>
        </div>

        {sent ? (
          <>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1e2030', marginBottom: '8px' }}>
              Correo enviado
            </h2>
            <p style={{ color: '#8b8fa3', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
              Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña.
            </p>
            <Link
              href="/login"
              style={{
                display: 'inline-block', padding: '12px 32px',
                background: 'linear-gradient(135deg, #1A9E76, #15B886)',
                color: '#fff', borderRadius: '12px', fontSize: '14px', fontWeight: 700,
                textDecoration: 'none', boxShadow: '0 4px 14px rgba(26,158,118,0.3)',
              }}
            >
              Volver al Login
            </Link>
          </>
        ) : (
          <>
            <h1 style={{
              fontSize: '24px', fontWeight: 800, color: '#1e2030',
              letterSpacing: '-0.03em', margin: '0 0 4px 0',
            }}>
              Recuperar Contraseña
            </h1>
            <p style={{ color: '#8b8fa3', fontSize: '14px', margin: '0 0 28px 0' }}>
              Ingresa tu correo y te enviaremos un enlace
            </p>

            {error && (
              <div style={{
                background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px',
                padding: '12px 16px', marginBottom: '20px', color: '#DC2626',
                fontSize: '13px', fontWeight: 500, textAlign: 'left',
              }}>
                {error}
              </div>
            )}

            <div style={{ textAlign: 'left' }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4a4e69', marginBottom: '6px' }}>
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  onKeyDown={(e) => e.key === 'Enter' && handleReset(e)}
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
                onClick={handleReset}
                disabled={loading || !email}
                style={{
                  width: '100%', padding: '14px',
                  background: loading ? '#8b8fa3' : 'linear-gradient(135deg, #1A9E76, #15B886)',
                  color: '#fff', border: 'none', borderRadius: '12px',
                  fontSize: '15px', fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                  cursor: loading ? 'wait' : 'pointer',
                  boxShadow: '0 4px 14px rgba(26,158,118,0.3)',
                  opacity: !email ? 0.5 : 1,
                }}
              >
                {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
              </button>
            </div>

            <div style={{ marginTop: '20px', fontSize: '13px', color: '#8b8fa3' }}>
              <Link href="/login" style={{ color: '#1A9E76', fontWeight: 600, textDecoration: 'none' }}>
                Volver al Login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

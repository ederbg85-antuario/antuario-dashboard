'use client'

import { useState } from 'react'
import AuthShell from '@/components/auth/AuthShell'

const LOGO = 'https://static.wixstatic.com/shapes/cff7e6_ceb7df677949454eb0aa2d5641d9ca75.svg'

export default function AdminInvitarPage() {
  const [email, setEmail]             = useState('')
  const [orgName, setOrgName]         = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [inviteUrl, setInviteUrl]     = useState('')
  const [copied, setCopied]           = useState(false)

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInviteUrl('')
    setLoading(true)

    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), organization_name: orgName.trim() || undefined }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.message ?? 'Error al crear la invitación')
      } else {
        setInviteUrl(data.invite_url)
        setEmail('')
        setOrgName('')
      }
    } catch {
      setError('Error de red. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <AuthShell>
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <img src={LOGO} alt="Antuario" className="auth-logo" />
        <h1 className="auth-title">Invitar usuario</h1>
        <p className="auth-sub">Solo tú puedes ver esta página</p>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {inviteUrl ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Caja del link */}
          <div style={{
            background: '#f0fdf4',
            border: '1.5px solid #bbf7d0',
            borderRadius: '12px',
            padding: '16px',
          }}>
            <p style={{ fontSize: '13px', color: '#166534', fontWeight: 600, marginBottom: '8px', fontFamily: 'Inter, sans-serif' }}>
              ✅ Invitación creada — válida 7 días
            </p>
            <p style={{
              fontSize: '12px',
              color: '#15803d',
              wordBreak: 'break-all',
              fontFamily: 'monospace',
              background: '#dcfce7',
              borderRadius: '8px',
              padding: '10px',
              margin: 0,
            }}>
              {inviteUrl}
            </p>
          </div>

          {/* Botones */}
          <button
            onClick={handleCopy}
            style={{
              width: '100%',
              padding: '13px',
              background: copied ? '#15803d' : 'linear-gradient(135deg, #1AC882, #0f9e66)',
              border: 'none',
              borderRadius: '14px',
              color: '#fff',
              fontWeight: 700,
              fontSize: '15px',
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
              transition: 'background 0.2s',
            }}
          >
            {copied ? '¡Copiado!' : 'Copiar enlace'}
          </button>

          <button
            onClick={() => { setInviteUrl(''); setCopied(false) }}
            style={{
              width: '100%',
              padding: '11px',
              background: 'transparent',
              border: '1.5px solid #d1d5db',
              borderRadius: '14px',
              color: '#6b7280',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Crear otra invitación
          </button>
        </div>
      ) : (
        <form onSubmit={handleInvite}>
          <div className="auth-field">
            <label className="auth-label">Correo del invitado</label>
            <input
              className="auth-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="cliente@empresa.com"
              autoComplete="off"
              required
            />
          </div>

          <div className="auth-field-last">
            <label className="auth-label">Nombre de organización <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span></label>
            <input
              className="auth-input"
              type="text"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder="Ej: Kryland, Acriland..."
              autoComplete="off"
            />
          </div>

          <button
            type="submit"
            className="auth-btn"
            disabled={loading || !email}
          >
            {loading ? 'Generando enlace...' : 'Generar enlace de invitación'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}

#!/bin/bash
# ============================================
# ANTUARIO AUTH SETUP SCRIPT
# Run this from your antuario-dashboard folder
# Usage: bash setup-auth.sh
# ============================================

echo "🔐 Configurando sistema de autenticación Antuario..."
echo ""

# Check we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: No estás en la carpeta del proyecto."
  echo "   Primero ejecuta: cd antuario-dashboard"
  exit 1
fi

# ---- Create directories ----
echo "📁 Creando directorios..."
mkdir -p lib/supabase
mkdir -p app/login
mkdir -p app/registro
mkdir -p app/recuperar
mkdir -p app/auth/callback

# ---- lib/supabase/client.ts ----
echo "📄 Creando lib/supabase/client.ts..."
cat > lib/supabase/client.ts << 'ENDOFFILE'
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
ENDOFFILE

# ---- lib/supabase/server.ts ----
echo "📄 Creando lib/supabase/server.ts..."
cat > lib/supabase/server.ts << 'ENDOFFILE'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignored when called from Server Component
          }
        },
      },
    }
  )
}
ENDOFFILE

# ---- middleware.ts (root) ----
echo "📄 Creando middleware.ts..."
cat > middleware.ts << 'ENDOFFILE'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Rutas públicas (no requieren login)
  const publicRoutes = ['/login', '/registro', '/recuperar', '/auth']
  const isPublicRoute = publicRoutes.some(route =>
    request.nextUrl.pathname.startsWith(route)
  )

  // Si no hay sesión y la ruta es privada → redirigir a login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Si hay sesión y está en login/registro → redirigir al dashboard
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/registro')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
ENDOFFILE

# ---- app/auth/callback/route.ts ----
echo "📄 Creando app/auth/callback/route.ts..."
cat > app/auth/callback/route.ts << 'ENDOFFILE'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
ENDOFFILE

# ---- app/login/page.tsx ----
echo "📄 Creando app/login/page.tsx..."
cat > app/login/page.tsx << 'ENDOFFILE'
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
ENDOFFILE

# ---- app/registro/page.tsx ----
echo "📄 Creando app/registro/page.tsx..."
cat > app/registro/page.tsx << 'ENDOFFILE'
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
ENDOFFILE

# ---- app/recuperar/page.tsx ----
echo "📄 Creando app/recuperar/page.tsx..."
cat > app/recuperar/page.tsx << 'ENDOFFILE'
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
ENDOFFILE

# ---- app/page.tsx (protected home) ----
echo "📄 Actualizando app/page.tsx..."
cat > app/page.tsx << 'ENDOFFILE'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const handleLogout = async () => {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
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
        maxWidth: '500px',
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

        <h1 style={{
          fontSize: '24px', fontWeight: 800, color: '#1e2030',
          letterSpacing: '-0.03em', margin: '0 0 8px 0',
        }}>
          Bienvenido a Antuario
        </h1>

        <p style={{ color: '#8b8fa3', fontSize: '14px', margin: '0 0 8px 0' }}>
          Sesión activa como:
        </p>
        <p style={{
          color: '#1A9E76', fontSize: '16px', fontWeight: 700,
          margin: '0 0 32px 0',
          background: '#D5F5E3', padding: '8px 16px',
          borderRadius: '8px', display: 'inline-block',
        }}>
          {user.email}
        </p>

        <p style={{
          color: '#8b8fa3', fontSize: '14px', lineHeight: 1.6,
          margin: '0 0 32px 0',
        }}>
          El sistema de autenticación está funcionando correctamente.
          Aquí irá el dashboard completo en las siguientes fases.
        </p>

        <form action={handleLogout}>
          <button
            type="submit"
            style={{
              padding: '12px 32px',
              background: '#f1f2f6',
              color: '#4a4e69',
              border: '1.5px solid #e2e4ea',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: 'pointer',
            }}
          >
            Cerrar Sesión
          </button>
        </form>
      </div>
    </div>
  )
}
ENDOFFILE

echo ""
echo "✅ ¡Sistema de autenticación creado!"
echo ""
echo "📋 Archivos creados:"
echo "   lib/supabase/client.ts    → Cliente Supabase para el navegador"
echo "   lib/supabase/server.ts    → Cliente Supabase para el servidor"
echo "   middleware.ts              → Protección de rutas"
echo "   app/login/page.tsx        → Pantalla de login"
echo "   app/registro/page.tsx     → Pantalla de registro"
echo "   app/recuperar/page.tsx    → Recuperar contraseña"
echo "   app/auth/callback/route.ts → Callback de autenticación"
echo "   app/page.tsx              → Página principal (protegida)"
echo ""
echo "🚀 Ahora ejecuta: npm run dev"
echo "   Y abre: http://localhost:3000"
echo "   Deberías ver la pantalla de login."

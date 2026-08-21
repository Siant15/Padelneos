'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginForm() {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  function switchMode(next: 'login' | 'signup' | 'forgot') {
    setMode(next)
    setError('')
    setInfo('')
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        setError('Email o contraseña incorrectos')
        setLoading(false)
        return
      }
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('No se pudo conectar. Comprueba tu conexión e inténtalo otra vez.')
      setLoading(false)
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')

    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, inviteCode }),
      })
      const body = await res.json()

      if (!res.ok) {
        setError(body.error ?? 'No se pudo crear la cuenta')
        setLoading(false)
        return
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setInfo('Cuenta creada. Ve a "Iniciar sesión" para entrar.')
        setLoading(false)
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('No se pudo conectar. Comprueba tu conexión e inténtalo otra vez.')
      setLoading(false)
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      setLoading(false)
      if (error) {
        setError('No se pudo enviar el email: ' + error.message)
        return
      }
      setInfo('Si ese email está registrado, te hemos enviado un enlace para cambiar la contraseña.')
    } catch {
      setLoading(false)
      setError('No se pudo conectar. Comprueba tu conexión e inténtalo otra vez.')
    }
  }

  const handleSubmit = mode === 'login' ? handleLogin : mode === 'signup' ? handleSignup : handleForgotPassword

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--page-bg)' }}>
      <div className="w-full max-w-sm">
        {/* Logo / título */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🎾</div>
          <h1 className="font-heading text-2xl font-extrabold" style={{ color: 'var(--text)' }}>Liga Pádel</h1>
          <p style={{ color: 'var(--text-muted)' }} className="mt-1 text-sm">Entre amigos, sin trampa</p>
        </div>

        {mode !== 'forgot' && (
          <div className="flex rounded-[14px] p-1 mb-4" style={{ background: 'var(--tint)' }}>
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="flex-1 rounded-[11px] py-2 font-heading font-bold text-sm transition"
              style={{ background: mode === 'login' ? '#fff' : 'transparent', color: mode === 'login' ? 'var(--accent)' : 'var(--text-muted2)' }}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className="flex-1 rounded-[11px] py-2 font-heading font-bold text-sm transition"
              style={{ background: mode === 'signup' ? '#fff' : 'transparent', color: mode === 'signup' ? 'var(--accent)' : 'var(--text-muted2)' }}
            >
              Registrarse
            </button>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-6 space-y-4"
          style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.06)' }}
        >
          {mode === 'forgot' && (
            <div>
              <h2 className="font-heading font-bold text-base mb-1">Recuperar contraseña</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Te enviamos un enlace por email para elegir una nueva.</p>
            </div>
          )}

          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-sm font-bold mb-1" style={{ color: 'var(--text-muted)' }}>
                  Nombre
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 rounded-[14px] text-sm outline-none transition"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  placeholder="Tu nombre"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1" style={{ color: 'var(--text-muted)' }}>
                  Código de invitación
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 rounded-[14px] text-sm outline-none transition"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  placeholder="Pídeselo a quien te invitó"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-bold mb-1" style={{ color: 'var(--text-muted)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-[14px] text-sm outline-none transition"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              placeholder="tu@email.com"
            />
          </div>

          {mode !== 'forgot' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-bold" style={{ color: 'var(--text-muted)' }}>
                  Contraseña
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs font-bold"
                    style={{ color: 'var(--accent)' }}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2.5 pr-11 rounded-[14px] text-sm outline-none transition"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  placeholder="Mínimo 8 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-center" style={{ color: 'var(--red)' }}>{error}</p>
          )}
          {info && (
            <p className="text-sm text-center" style={{ color: 'var(--green)' }}>{info}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="font-heading w-full py-2.5 rounded-[14px] font-bold text-sm transition hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {loading
              ? (mode === 'login' ? 'Entrando...' : mode === 'signup' ? 'Creando cuenta...' : 'Enviando...')
              : (mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Enviar enlace')}
          </button>

          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full text-sm font-bold text-center"
              style={{ color: 'var(--text-muted)' }}
            >
              ← Volver a iniciar sesión
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

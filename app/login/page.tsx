'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })

    if (error) {
      setError(error.message === 'User already registered' ? 'Ese email ya está registrado' : error.message)
      setLoading(false)
      return
    }

    if (data.session) {
      router.push('/dashboard')
      router.refresh()
    } else {
      setInfo('Cuenta creada. Revisa tu email para confirmar el registro antes de entrar.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--page-bg)' }}>
      <div className="w-full max-w-sm">
        {/* Logo / título */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🎾</div>
          <h1 className="font-heading text-2xl font-extrabold" style={{ color: 'var(--text)' }}>Liga Pádel</h1>
          <p style={{ color: 'var(--text-muted)' }} className="mt-1 text-sm">Entre amigos, sin trampa</p>
        </div>

        {/* Toggle login/registro */}
        <div className="flex rounded-[14px] p-1 mb-4" style={{ background: 'var(--tint)' }}>
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); setInfo('') }}
            className="flex-1 rounded-[11px] py-2 font-heading font-bold text-sm transition"
            style={{ background: mode === 'login' ? '#fff' : 'transparent', color: mode === 'login' ? 'var(--accent)' : 'var(--text-muted2)' }}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(''); setInfo('') }}
            className="flex-1 rounded-[11px] py-2 font-heading font-bold text-sm transition"
            style={{ background: mode === 'signup' ? '#fff' : 'transparent', color: mode === 'signup' ? 'var(--accent)' : 'var(--text-muted2)' }}
          >
            Registrarse
          </button>
        </div>

        <form
          onSubmit={mode === 'login' ? handleLogin : handleSignup}
          className="rounded-2xl p-6 space-y-4"
          style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.06)' }}
        >
          {mode === 'signup' && (
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

          <div>
            <label className="block text-sm font-bold mb-1" style={{ color: 'var(--text-muted)' }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2.5 rounded-[14px] text-sm outline-none transition"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              placeholder="••••••••"
            />
          </div>

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
              ? (mode === 'login' ? 'Entrando...' : 'Creando cuenta...')
              : (mode === 'login' ? 'Entrar' : 'Crear cuenta')}
          </button>
        </form>
      </div>
    </div>
  )
}

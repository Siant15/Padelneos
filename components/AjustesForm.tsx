'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import PwaSetup from '@/components/PwaSetup'

export default function AjustesForm() {
  const supabase = createClient()
  const router = useRouter()

  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPasswordSaving(true)
    setPasswordError('')

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })

    setPasswordSaving(false)
    if (updateError) {
      setPasswordError('No se pudo cambiar la contraseña: ' + updateError.message)
      return
    }
    setNewPassword('')
    setPasswordSaved(true)
    setTimeout(() => setPasswordSaved(false), 2000)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="px-5 pt-5 pb-6">
      <h1 className="font-heading text-[22px] font-extrabold mb-4">⚙️ Ajustes</h1>

      <form
        onSubmit={handlePasswordSubmit}
        className="rounded-2xl p-4 flex flex-col gap-4"
        style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
      >
        <h2 className="font-heading text-sm font-bold">🔒 Cambiar contraseña</h2>

        <div>
          <label className="block text-sm font-bold mb-1.5" style={{ color: 'var(--text-muted)' }}>Contraseña nueva</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              style={{ ...inputStyle, paddingRight: 44 }}
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

        {passwordError && <p className="text-sm text-center" style={{ color: 'var(--red)' }}>⚠ {passwordError}</p>}

        <button
          type="submit"
          disabled={passwordSaving || newPassword.length < 8}
          className="font-heading w-full py-2.5 rounded-[14px] font-bold text-sm transition hover:opacity-90 disabled:opacity-50"
          style={{ background: passwordSaved ? 'var(--green)' : 'var(--accent)', color: '#fff' }}
        >
          {passwordSaving ? 'Guardando...' : passwordSaved ? '✓ Contraseña actualizada' : 'Cambiar contraseña'}
        </button>
      </form>

      <div className="mt-4">
        <PwaSetup />
      </div>

      <button
        onClick={handleLogout}
        className="font-heading w-full py-2.5 rounded-[14px] font-bold text-sm text-center mt-4 transition hover:opacity-90"
        style={{ background: 'var(--surface)', color: 'var(--red)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
      >
        Salir
      </button>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 14,
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 14,
  outline: 'none',
}

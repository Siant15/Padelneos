'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function PerfilPage() {
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '',
    racket_brand: '',
    dominant_hand: '',
    preferred_side: '',
  })

  const [userId, setUserId] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState('')

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setUploadingAvatar(true)
    setAvatarError('')

    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${userId}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadError) {
      setAvatarError('No se pudo subir la foto: ' + uploadError.message)
      setUploadingAvatar(false)
      return
    }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = `${pub.publicUrl}?t=${Date.now()}`

    const { error: updateError } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
    setUploadingAvatar(false)
    if (updateError) {
      setAvatarError('Foto subida, pero no se pudo guardar: ' + updateError.message)
      return
    }
    setAvatarUrl(url)
    router.refresh()
  }

  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

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

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (data) {
        setForm({
          name: data.name ?? '',
          racket_brand: data.racket_brand ?? '',
          dominant_hand: data.dominant_hand ?? '',
          preferred_side: data.preferred_side ?? '',
        })
        setAvatarUrl(data.avatar_url ?? null)
      } else {
        // No debería faltar (se crea al registrarse), pero por si acaso
        // precargamos el nombre desde el email para no dejar el campo vacío.
        setForm(f => ({ ...f, name: user.email?.split('@')[0] ?? '' }))
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { error: updateError } = await supabase.from('profiles').upsert({
      id: user.id,
      name: form.name,
      racket_brand: form.racket_brand || null,
      dominant_hand: form.dominant_hand || null,
      preferred_side: form.preferred_side || null,
    }, { onConflict: 'id' })

    setSaving(false)
    if (updateError) {
      setError('No se pudo guardar: ' + updateError.message)
      return
    }
    setSaved(true)
    router.refresh()
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) {
    return <div className="px-5 pt-5 pb-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando...</div>
  }

  return (
    <div className="px-5 pt-5 pb-6">
      <h1 className="font-heading text-[22px] font-extrabold mb-4">🙋 Mi perfil</h1>

      <div className="flex flex-col items-center mb-5">
        <label className="relative cursor-pointer">
          <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" disabled={uploadingAvatar} />
          {avatarUrl ? (
            <img src={avatarUrl} alt="Foto de perfil" className="w-21 h-21 rounded-full object-cover" style={{ width: 84, height: 84, border: '2px solid var(--border)' }} />
          ) : (
            <div
              className="flex items-center justify-center rounded-full font-heading font-extrabold text-2xl"
              style={{ width: 84, height: 84, background: 'var(--surface2)', color: 'var(--accent)', border: '2px solid var(--border)' }}
            >
              {form.name.slice(0, 2).toUpperCase() || '🎾'}
            </div>
          )}
        </label>
        <span className="text-xs font-bold mt-2" style={{ color: 'var(--accent)' }}>
          {uploadingAvatar ? 'Subiendo...' : '📷 Cambiar foto'}
        </span>
        {avatarError && <p className="text-xs mt-1" style={{ color: 'var(--red)' }}>⚠ {avatarError}</p>}
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl p-4 flex flex-col gap-4"
        style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
      >
        <Field label="Nombre">
          <input
            type="text"
            required
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            style={inputStyle}
          />
        </Field>

        <Field label="🎾 Marca de pala">
          <input
            type="text"
            value={form.racket_brand}
            onChange={e => setForm(f => ({ ...f, racket_brand: e.target.value }))}
            placeholder="Ej: Bullpadel, Head, Nox..."
            style={inputStyle}
          />
        </Field>

        <Field label="✋ Mano dominante">
          <div className="grid grid-cols-2 gap-2">
            {[{ v: 'diestra', label: 'Diestra' }, { v: 'zurda', label: 'Zurda' }].map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setForm(f => ({ ...f, dominant_hand: v }))}
                className="font-heading py-2.5 rounded-[14px] text-sm font-bold transition"
                style={{
                  background: form.dominant_hand === v ? 'var(--accent)' : 'var(--surface2)',
                  color: form.dominant_hand === v ? '#fff' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="↔️ Lado preferido en pista">
          <div className="grid grid-cols-2 gap-2">
            {[{ v: 'drive', label: 'Drive (derecha)' }, { v: 'reves', label: 'Revés (izquierda)' }].map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setForm(f => ({ ...f, preferred_side: v }))}
                className="font-heading py-2.5 rounded-[14px] text-sm font-bold transition"
                style={{
                  background: form.preferred_side === v ? 'var(--accent)' : 'var(--surface2)',
                  color: form.preferred_side === v ? '#fff' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        {error && <p className="text-sm text-center" style={{ color: 'var(--red)' }}>⚠ {error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="font-heading w-full py-2.5 rounded-[14px] font-bold text-sm transition hover:opacity-90 disabled:opacity-50"
          style={{ background: saved ? 'var(--green)' : 'var(--accent)', color: '#fff' }}
        >
          {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar cambios'}
        </button>
      </form>

      <form
        onSubmit={handlePasswordSubmit}
        className="rounded-2xl p-4 flex flex-col gap-4 mt-4"
        style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
      >
        <h2 className="font-heading text-sm font-bold">🔒 Cambiar contraseña</h2>

        <Field label="Contraseña nueva">
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
        </Field>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-bold mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
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

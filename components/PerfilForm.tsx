'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import CompetitiveDnaRadar from '@/components/CompetitiveDnaRadar'
import type { PlayerDna } from '@/lib/dna-data'
import type { SeasonCourtExpenses } from '@/lib/supabase/cached'

type Stats = { matches_played: number; wins: number; total_points: number }

// Reduce cualquier foto (aunque venga de un móvil a varios MB y miles
// de píxeles) a un cuadrado de como mucho `maxSize`px en JPEG — de
// sobra para un avatar que nunca se ve a más de ~84px, y evita que
// subir una foto de perfil deje la app lenta para todos.
function resizeImageToJpeg(file: File, maxSize: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const side = Math.min(img.width, img.height)
      const sx = (img.width - side) / 2
      const sy = (img.height - side) / 2
      const size = Math.min(maxSize, side)
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('No se pudo procesar la imagen')); return }
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen')), 'image/jpeg', 0.8)
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('No se pudo leer la imagen')) }
    img.src = objectUrl
  })
}

export default function PerfilForm({
  userId,
  initialName,
  initialRacketBrand,
  initialDominantHand,
  initialPreferredSide,
  initialAvatarUrl,
  initialStats,
  dnaPlayers,
  seasonLabel,
  courtExpenses,
}: {
  userId: string
  initialName: string
  initialRacketBrand: string
  initialDominantHand: string
  initialPreferredSide: string
  initialAvatarUrl: string | null
  initialStats: Stats
  dnaPlayers: PlayerDna[]
  seasonLabel: string
  courtExpenses: SeasonCourtExpenses | null
}) {
  const supabase = createClient()
  const router = useRouter()

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: initialName,
    racket_brand: initialRacketBrand,
    dominant_hand: initialDominantHand,
    preferred_side: initialPreferredSide,
  })

  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const stats = initialStats

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setUploadingAvatar(true)
    setAvatarError('')

    // Las fotos de móvil pueden pesar varios MB a resoluciones enormes
    // para un círculo que como mucho se ve a 84px — se reducen aquí
    // antes de subir para que la foto de perfil no sea la razón de que
    // la app vaya lenta en cuanto alguien sube la suya.
    const path = `${userId}/avatar.jpg`
    let resized: Blob
    try {
      resized = await resizeImageToJpeg(file, 256)
    } catch {
      setAvatarError('No se pudo procesar la imagen. Prueba con otra foto.')
      setUploadingAvatar(false)
      return
    }

    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, resized, { upsert: true, contentType: 'image/jpeg' })
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const { error: updateError } = await supabase.from('profiles').upsert({
      id: userId,
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

      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <StatCard value={stats.matches_played} label="Partidos" />
        <StatCard value={stats.wins} label="Victorias" />
        <StatCard value={stats.total_points} label="Puntos" accent />
      </div>

      {dnaPlayers.length > 0 && (
        <CompetitiveDnaRadar players={dnaPlayers} viewerId={userId} seasonLabel={seasonLabel} />
      )}

      {courtExpenses && <CourtExpensesCard userId={userId} expenses={courtExpenses} />}

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

      <Link href="/ajustes" className="block text-center text-sm font-bold mt-4" style={{ color: 'var(--text-muted)' }}>
        ⚙️ Contraseña, notificaciones y salir →
      </Link>
    </div>
  )
}

// El pago de la pista lo adelanta cada semana quien reserva, a precio
// distinto según club/hora — esta tarjeta muestra cuánto ha puesto
// cada uno y quién debe compensar a quién para que quede a la par.
function CourtExpensesCard({ userId, expenses }: { userId: string; expenses: SeasonCourtExpenses }) {
  if (expenses.totalCost === 0) {
    return (
      <div className="rounded-2xl p-4 mb-5 text-sm" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)', color: 'var(--text-muted)' }}>
        💸 Aún no se ha registrado ningún coste de pista esta temporada.
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-4 mb-5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
      <p className="font-heading text-sm font-bold mb-1">💸 Gastos de pista</p>
      <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
        {expenses.totalCost.toFixed(2)}€ en total esta temporada · {expenses.fairShare.toFixed(2)}€ por persona
      </p>

      <div className="flex flex-col gap-1.5 mb-3">
        {expenses.balances.map(b => (
          <div key={b.playerId} className="flex items-center justify-between text-xs">
            <span className={b.playerId === userId ? 'font-bold' : ''}>{b.name}{b.playerId === userId ? ' (tú)' : ''}</span>
            <span className="flex items-center gap-2">
              <span style={{ color: 'var(--text-muted)' }}>pagado: {b.paid.toFixed(2)}€</span>
              <span className="font-bold" style={{ color: b.balance > 0.01 ? 'var(--green)' : b.balance < -0.01 ? 'var(--red)' : 'var(--text-muted)' }}>
                {b.balance > 0.01 ? `le deben ${b.balance.toFixed(2)}€` : b.balance < -0.01 ? `debe ${Math.abs(b.balance).toFixed(2)}€` : 'al día'}
              </span>
            </span>
          </div>
        ))}
      </div>

      {expenses.transfers.length > 0 && (
        <div className="pt-3 flex flex-col gap-1" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Para quedar en paz:</p>
          {expenses.transfers.map((t, i) => (
            <p key={i} className="text-xs">
              <strong>{t.fromName}</strong> le debe <strong>{t.amount.toFixed(2)}€</strong> a <strong>{t.toName}</strong>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div
      className="rounded-2xl p-3.5 text-center"
      style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
    >
      <div className="font-heading font-extrabold text-lg" style={{ color: accent ? 'var(--accent)' : 'var(--text)' }}>{value}</div>
      <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
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

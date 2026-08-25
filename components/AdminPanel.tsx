'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addMember, changeMemberPassword, removeMember, type MemberRow } from '@/lib/admin-actions'

export default function AdminPanel({ members }: { members: MemberRow[] }) {
  const router = useRouter()

  return (
    <div className="flex flex-col gap-4">
      <AddMemberForm onAdded={() => router.refresh()} />

      <div className="flex flex-col gap-3">
        {members.map(m => (
          <MemberRowCard key={m.id} member={m} onChanged={() => router.refresh()} />
        ))}
        {!members.length && (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No hay miembros todavía.</p>
        )}
      </div>
    </div>
  )
}

function AddMemberForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await addMember(name, email, password)
    setSaving(false)
    if (error) { setError(error); return }
    setName(''); setEmail(''); setPassword(''); setOpen(false)
    onAdded()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="font-heading w-full py-2.5 rounded-[14px] font-bold text-sm transition hover:opacity-90"
        style={{ background: 'var(--accent)', color: '#fff' }}
      >
        + Añadir miembro
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
    >
      <p className="text-sm font-bold">Nuevo miembro</p>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre" required style={inputStyle} />
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" required style={inputStyle} />
      <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña (mínimo 8 caracteres)" type="password" minLength={8} required style={inputStyle} />
      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>⚠ {error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="flex-1 py-2 rounded-xl text-sm font-bold" style={{ background: 'var(--tint)', color: '#555' }}>
          Cancelar
        </button>
        <button type="submit" disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-bold disabled:opacity-50" style={{ background: 'var(--accent)', color: '#fff' }}>
          {saving ? 'Creando...' : 'Crear'}
        </button>
      </div>
    </form>
  )
}

function MemberRowCard({ member, onChanged }: { member: MemberRow; onChanged: () => void }) {
  const [showPassword, setShowPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await changeMemberPassword(member.id, newPassword)
    setSaving(false)
    if (error) { setError(error); return }
    setNewPassword('')
    setShowPassword(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleDelete() {
    setDeleting(true)
    setError('')
    const { error } = await removeMember(member.id)
    setDeleting(false)
    if (error) { setError(error); setConfirmingDelete(false); return }
    onChanged()
  }

  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold text-sm">{member.name} {member.isAdmin && <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>(admin)</span>}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{member.email}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setShowPassword(v => !v)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--tint)', color: 'var(--text-muted2)' }}>
            Contraseña
          </button>
          {!member.isAdmin && (
            <button onClick={() => setConfirmingDelete(true)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg" style={{ background: 'oklch(0.95 0.04 30)', color: 'var(--red)' }}>
              Eliminar
            </button>
          )}
        </div>
      </div>

      {showPassword && (
        <form onSubmit={handlePasswordSubmit} className="flex gap-2 mt-3">
          <input
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            type="password"
            placeholder="Nueva contraseña"
            minLength={8}
            required
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="submit" disabled={saving} className="text-xs font-bold px-3 rounded-xl disabled:opacity-50" style={{ background: saved ? 'var(--green)' : 'var(--accent)', color: '#fff' }}>
            {saving ? '...' : saved ? '✓' : 'Guardar'}
          </button>
        </form>
      )}

      {confirmingDelete && (
        <div className="mt-3 rounded-xl p-3" style={{ background: 'oklch(0.97 0.02 30)' }}>
          <p className="text-xs font-bold mb-2" style={{ color: 'var(--red)' }}>
            ¿Seguro que quieres eliminar a {member.name}? Esta acción no se puede deshacer.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmingDelete(false)} className="flex-1 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'var(--tint)' }}>
              Cancelar
            </button>
            <button onClick={handleDelete} disabled={deleting} className="flex-1 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50" style={{ background: 'var(--red)', color: '#fff' }}>
              {deleting ? 'Eliminando...' : 'Sí, eliminar'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs mt-2" style={{ color: 'var(--red)' }}>⚠ {error}</p>}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 12,
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 16,
  outline: 'none',
}

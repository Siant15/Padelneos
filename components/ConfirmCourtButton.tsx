'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { confirmCourtReservation } from '@/lib/court-actions'

export default function ConfirmCourtButton({ roundId }: { roundId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function confirm() {
    setLoading(true)
    setError('')
    const { error } = await confirmCourtReservation(roundId)
    setLoading(false)
    if (error) {
      setError('No se pudo confirmar: ' + error)
      return
    }
    router.refresh()
  }

  return (
    <div>
      <button
        onClick={confirm}
        disabled={loading}
        className="font-heading w-full text-[14px] py-2.5 rounded-[14px] font-bold transition hover:opacity-90 disabled:opacity-50"
        style={{ background: 'var(--accent)', color: '#fff' }}
      >
        {loading ? 'Confirmando...' : 'Confirmar reserva'}
      </button>
      {error && <p className="text-xs mt-1.5" style={{ color: 'var(--red)' }}>⚠ {error}</p>}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { revalidateLigaData } from '@/lib/actions'

export default function ConfirmCourtButton({ roundId }: { roundId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function confirm() {
    setLoading(true)
    setError('')
    const { error } = await supabase
      .from('rounds')
      .update({ court_confirmed: true })
      .eq('id', roundId)
    setLoading(false)
    if (error) {
      setError('No se pudo confirmar: ' + error.message)
      return
    }
    await revalidateLigaData()
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

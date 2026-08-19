'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function ConfirmCourtButton({ roundId }: { roundId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function confirm() {
    setLoading(true)
    await supabase
      .from('rounds')
      .update({ court_confirmed: true })
      .eq('id', roundId)
    router.refresh()
    setLoading(false)
  }

  return (
    <button
      onClick={confirm}
      disabled={loading}
      className="font-heading w-full text-[14px] py-2.5 rounded-[14px] font-bold transition hover:opacity-90 disabled:opacity-50"
      style={{ background: 'var(--accent)', color: '#fff' }}
    >
      {loading ? 'Confirmando...' : 'Confirmar reserva'}
    </button>
  )
}

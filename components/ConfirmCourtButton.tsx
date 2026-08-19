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
      className="text-xs px-3 py-1.5 rounded-lg font-semibold transition hover:opacity-80 disabled:opacity-50"
      style={{ background: 'var(--green)', color: '#fff' }}
    >
      {loading ? 'Confirmando...' : 'Confirmar pista ✓'}
    </button>
  )
}

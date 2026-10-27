import AjustesForm from '@/components/AjustesForm'
import ResponsablesReserva, { type ResponsableRound } from '@/components/ResponsablesReserva'
import Link from 'next/link'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin'
import { formatDate } from '@/lib/types'

export default async function AjustesPage() {
  const supabase = await createClient()
  const user = await getCachedUser()

  // Lecturas sin caché: aquí se editan los responsables, así que siempre hay que ver el valor real.
  const [{ data: players }, { data: season }] = await Promise.all([
    supabase.from('profiles').select('id, name').order('name'),
    supabase.from('seasons').select('id').eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const { data: rounds } = season
    ? await supabase.from('rounds').select('id, round_number, scheduled_date, status, court_booker_id').eq('season_id', season.id).neq('status', 'cancelled').order('round_number')
    : { data: [] as { id: string; round_number: number; scheduled_date: string | null; status: string; court_booker_id: string | null }[] }

  const items: ResponsableRound[] = (rounds ?? []).map(r => ({
    id: r.id,
    roundNumber: r.round_number,
    dateLabel: r.scheduled_date ? formatDate(r.scheduled_date) : 'Fecha por confirmar',
    bookerId: r.court_booker_id ?? '',
    played: r.status === 'played',
  }))

  return (
    <AjustesForm>
      <div className="flex flex-col gap-4">
        {isAdminUser(user) && (
          <Link
            href="/admin"
            className="block rounded-2xl p-4 transition hover:opacity-90"
            style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
          >
            <span className="font-heading text-sm font-bold">🛠️ Administración →</span>
            <span className="block text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Miembros, ligas y clubs.</span>
          </Link>
        )}
        <ResponsablesReserva rounds={items} players={players ?? []} />
      </div>
    </AjustesForm>
  )
}

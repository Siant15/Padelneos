import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/types'
import { getCachedSeasonBettingRanking, getCachedSeasonCourtExpenses } from '@/lib/supabase/cached'
import ShareSummaryButton from '@/components/ShareSummaryButton'

const MEDALS = ['🥇', '🥈', '🥉', '4º']

export default async function HistoricoSeasonPage({ params }: { params: Promise<{ seasonId: string }> }) {
  const { seasonId } = await params
  const supabase = await createClient()

  const [{ data: season }, { data: rounds }, { data: individual }, { data: pairs }, bettingRanking, courtExpenses] = await Promise.all([
    supabase.from('seasons').select('id, name, start_date, min_matches, status').eq('id', seasonId).maybeSingle(),
    supabase.from('rounds').select(`
      id, round_number, scheduled_date, scheduled_time, club, status,
      match:matches(
        winner, set1_t1, set1_t2, set2_t1, set2_t2, set3_t1, set3_t2,
        team1_p1:profiles!team1_p1_id(name), team1_p2:profiles!team1_p2_id(name),
        team2_p1:profiles!team2_p1_id(name), team2_p2:profiles!team2_p2_id(name)
      )
    `).eq('season_id', seasonId).order('round_number', { ascending: true }),
    supabase.from('individual_standings').select('*').eq('season_id', seasonId).order('total_points', { ascending: false }).order('sport_points', { ascending: false }),
    supabase.from('pair_standings').select('*').eq('season_id', seasonId).order('points', { ascending: false }).order('wins', { ascending: false }),
    getCachedSeasonBettingRanking(seasonId),
    getCachedSeasonCourtExpenses(seasonId),
  ])

  if (!season) notFound()

  const topBettor = bettingRanking[0]
  const topPair = pairs?.[0]
  const summaryLines = [
    `🏁 Así quedó la Liga "${season.name}"`,
    '',
    '🏅 Clasificación individual:',
    ...(individual ?? []).map((s, i) => `${MEDALS[i] ?? `${i + 1}º`} ${s.name} — ${s.total_points} pts`),
  ]
  if (topPair) summaryLines.push('', `🤝 Mejor pareja: ${topPair.p1_name} / ${topPair.p2_name} (${topPair.points} pts)`)
  if (topBettor) summaryLines.push('', `🎰 Rey de las apuestas: ${topBettor.name} (${topBettor.points} pts, ${topBettor.correct_picks} aciertos)`)
  if (courtExpenses.totalCost > 0) {
    summaryLines.push('', `💸 Pista: ${courtExpenses.totalCost.toFixed(2)}€ en total (${courtExpenses.fairShare.toFixed(2)}€ por persona)`)
    for (const t of courtExpenses.transfers) {
      summaryLines.push(`  ${t.fromName} le debe ${t.amount.toFixed(2)}€ a ${t.toName}`)
    }
  }
  const summaryText = summaryLines.join('\n')

  return (
    <div className="px-5 pt-5 pb-6 flex flex-col gap-4">
      <div>
        <Link href="/liga/historico" className="text-sm" style={{ color: 'var(--text-muted)' }}>← Volver</Link>
        <h1 className="font-heading text-[22px] font-extrabold mt-2">{season.name}</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Empezó el {formatDate(season.start_date)} · {season.min_matches} jornadas · Finalizada
        </p>
      </div>

      <ShareSummaryButton text={summaryText} />

      <div>
        <h2 className="font-heading font-bold text-sm mb-2">Clasificación individual</h2>
        <div className="rounded-2xl px-3.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
          {(individual ?? []).map((s, i) => (
            <div
              key={s.player_id}
              className="flex justify-between items-center py-2.5"
              style={{ borderBottom: i < (individual?.length ?? 0) - 1 ? '1px solid var(--hairline)' : undefined }}
            >
              <span className="text-[13px] font-bold">{MEDALS[i] ?? `${i + 1}º`} {s.name}</span>
              <span className="text-[13px] font-extrabold" style={{ color: 'var(--accent)' }}>{s.total_points} pts</span>
            </div>
          ))}
          {!individual?.length && <p className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Sin datos.</p>}
        </div>
      </div>

      <div>
        <h2 className="font-heading font-bold text-sm mb-2">Clasificación por parejas</h2>
        <div className="rounded-2xl px-3.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
          {(pairs ?? []).map((p, i) => (
            <div
              key={p.pair_key}
              className="flex justify-between items-center py-2.5"
              style={{ borderBottom: i < (pairs?.length ?? 0) - 1 ? '1px solid var(--hairline)' : undefined }}
            >
              <span className="text-[13px] font-bold">{p.p1_name} / {p.p2_name}</span>
              <span className="text-[13px] font-extrabold" style={{ color: 'var(--accent)' }}>{p.points} pts</span>
            </div>
          ))}
          {!pairs?.length && <p className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Sin datos.</p>}
        </div>
      </div>

      <div>
        <h2 className="font-heading font-bold text-sm mb-2">Jornadas</h2>
        <div className="flex flex-col gap-2">
          {(rounds ?? []).map(r => {
            const m = r.match as unknown as {
              winner: string | null
              set1_t1: number | null; set1_t2: number | null; set2_t1: number | null; set2_t2: number | null; set3_t1: number | null; set3_t2: number | null
              team1_p1?: { name: string }; team1_p2?: { name: string }; team2_p1?: { name: string }; team2_p2?: { name: string }
            } | null
            const sets = m && m.set1_t1 !== null
              ? [`${m.set1_t1}-${m.set1_t2}`, `${m.set2_t1}-${m.set2_t2}`, ...(m.set3_t1 !== null ? [`${m.set3_t1}-${m.set3_t2}`] : [])].join(', ')
              : null
            return (
              <div key={r.id} className="rounded-2xl p-3.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
                <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span className="font-bold" style={{ color: 'var(--text)' }}>J{r.round_number}</span>
                  <span>{r.scheduled_date ? formatDate(r.scheduled_date) : 'Sin fecha'}{r.club ? ` · ${r.club}` : ''}</span>
                </div>
                {m ? (
                  <div className="flex items-center justify-between mt-1.5 text-[13px]">
                    <span className="font-bold" style={{ color: m.winner === 'team1' ? 'var(--green)' : undefined }}>
                      {m.team1_p1?.name} / {m.team1_p2?.name}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{sets ?? 'Sin jugar'}</span>
                    <span className="font-bold" style={{ color: m.winner === 'team2' ? 'var(--green)' : undefined }}>
                      {m.team2_p1?.name} / {m.team2_p2?.name}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>Sin emparejamiento</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

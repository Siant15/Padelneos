import Link from 'next/link'

// Los 4 pasos de una jornada, siempre en este orden. `current` es el paso en
// el que está la jornada ahora (5 = todo hecho). Los anteriores salen
// marcados y, junto con el actual, son enlaces a su pantalla.
const STEPS = [
  { n: 1, label: 'Reserva', path: 'reserva' },
  { n: 2, label: 'Resultado', path: 'resultado' },
  { n: 3, label: 'Apuestas', path: 'resultado' },
  { n: 4, label: 'Liquidar', path: 'resultado' },
] as const

export default function JornadaSteps({ roundId, current }: { roundId: string; current: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Pasos de la jornada">
      {STEPS.map(step => {
        const done = step.n < current
        const active = step.n === current
        const content = (
          <span
            className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-full whitespace-nowrap"
            style={{
              background: active ? 'var(--accent)' : done ? 'var(--green-bg)' : 'var(--tint)',
              color: active ? '#fff' : done ? 'var(--green)' : 'var(--text-muted)',
            }}
            aria-current={active ? 'step' : undefined}
          >
            {done ? '✓' : step.n} {step.label}
          </span>
        )
        return (
          <li key={step.n} className="shrink-0">
            {step.n <= current ? <Link href={`/admin/jornadas/${roundId}/${step.path}`}>{content}</Link> : content}
          </li>
        )
      })}
    </ol>
  )
}

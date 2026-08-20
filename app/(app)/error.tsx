'use client'

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="px-5 pt-10 pb-6 flex flex-col items-center gap-3 text-center">
      <p className="text-3xl">😵</p>
      <p className="font-heading font-bold text-sm">Algo ha ido mal</p>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        No se ha podido cargar esta página. Prueba otra vez.
      </p>
      <button
        onClick={reset}
        className="mt-1 font-heading text-xs font-bold px-4 py-2 rounded-xl transition hover:opacity-90"
        style={{ background: 'var(--accent)', color: '#fff' }}
      >
        Reintentar
      </button>
    </div>
  )
}

import Link from 'next/link'

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center"
      style={{ background: 'var(--page-bg)', color: 'var(--text)' }}
    >
      <div className="text-5xl">🎾</div>
      <h1 className="font-heading text-xl font-extrabold">Página no encontrada</h1>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Esta pantalla no existe o se ha movido.
      </p>
      <Link
        href="/dashboard"
        className="font-heading mt-2 px-5 py-2.5 rounded-[14px] font-bold text-sm text-white"
        style={{ background: 'var(--accent)' }}
      >
        Volver a Inicio
      </Link>
    </div>
  )
}

export default function Loading() {
  return (
    <div className="px-5 pt-10 pb-6 flex flex-col items-center gap-3 text-center">
      <div
        className="w-8 h-8 rounded-full animate-spin"
        style={{ border: '3px solid var(--tint)', borderTopColor: 'var(--accent)' }}
      />
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando...</p>
    </div>
  )
}

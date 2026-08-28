// Círculo con la foto de perfil, o las iniciales del nombre si no
// tiene — mismo patrón que ya se repetía suelto en Perfil, el panel
// de admin y el perfil público de jugador, ahora en un solo sitio.
export default function Avatar({ name, avatarUrl, size = 20 }: { name: string; avatarUrl?: string | null; size?: number }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, border: '1px solid var(--border)' }}
      />
    )
  }
  return (
    <div
      className="flex items-center justify-center rounded-full font-heading font-extrabold shrink-0"
      style={{
        width: size, height: size, background: 'var(--surface2)', color: 'var(--accent)',
        border: '1px solid var(--border)', fontSize: Math.max(8, size * 0.4),
      }}
    >
      {name.slice(0, 2).toUpperCase() || '🎾'}
    </div>
  )
}

// Bloques grises que ocupan el sitio de lo que está cargando: la pantalla no
// salta al llegar los datos y se siente instantánea.
export function SkeletonBlock({ height, radius = 16 }: { height: number; radius?: number }) {
  return <div className="animate-pulse" style={{ height, borderRadius: radius, background: 'var(--tint)' }} aria-hidden />
}

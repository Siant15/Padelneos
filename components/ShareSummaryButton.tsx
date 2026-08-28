'use client'

// Mismo patrón que el "Compartir resultado" de una jornada
// (ResultadoForm.tsx): Web Share API si el navegador la soporta, si no
// abre WhatsApp directamente con el texto ya listo.
export default function ShareSummaryButton({ text }: { text: string }) {
  async function handleShare() {
    if (navigator.share) {
      try { await navigator.share({ text }); return } catch { /* usuario canceló, seguimos al fallback */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <button
      onClick={handleShare}
      className="w-full py-3 rounded-xl font-semibold text-center transition hover:opacity-90"
      style={{ background: '#25D366', color: '#fff' }}
    >
      📤 Compartir resumen de la liga
    </button>
  )
}

'use client'

import type { ReactNode } from 'react'

// Los componentes servidor no pueden poner onClick directamente en un
// <a>/<div> nativo (no hay límite cliente al que adjuntarlo) — este
// envoltorio da ese límite para frenar la propagación hacia una
// ClickableCard exterior sin tener que convertir toda la página en
// componente cliente.
export default function StopPropagation({ children }: { children: ReactNode }) {
  return (
    <span onClick={e => e.stopPropagation()} style={{ display: 'contents' }}>
      {children}
    </span>
  )
}

'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'

// Punto de información: un icono "i" discreto que despliega la explicación
// al tocarlo, para que el texto no ocupe sitio cuando no hace falta.
export default function InfoToggle({ label, lead, children }: { label: string; lead?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="px-0.5 pt-1.5">
      <div className={`flex items-center ${lead ? 'justify-between' : 'justify-end'}`}>
        {lead}
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-label={label}
          aria-expanded={open}
          className="flex items-center justify-center rounded-full p-1"
          style={{ color: open ? 'var(--accent)' : 'var(--text-muted2)', background: open ? 'var(--tint)' : undefined }}
        >
          <Info size={16} strokeWidth={2.2} />
        </button>
      </div>
      {open && (
        <div className="text-[11px] flex flex-col gap-1 pb-1" style={{ color: 'var(--text-muted)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// Publicidad de la app. Todo lo que se puede querer cambiar está aquí.

// Último día (inclusive, hora de Madrid) en que se ven el banner de Inicio
// y el popup de bienvenida.
export const EVENT_BANNER_UNTIL = '2026-11-09'
export const WELCOME_POPUP_UNTIL = '2026-11-09'

// Mensaje del popup de bienvenida (debajo de la foto).
export const WELCOME_MESSAGE = {
  title: 'Sí, esto es publicidad 📣',
  text: 'Este mensaje ha sido aprobado por mí!',
  ctaLabel: 'Ver Creativa Barcelona',
  ctaHref: 'https://creativabarcelona.com/',
  closeLabel: '¡Entendido, sigo apostando!',
}

export type Ad = {
  id: string
  title: string
  subtitle: string
  href: string
  // Último día (inclusive) en que se muestra; sin fecha = siempre.
  until?: string
}

// Eventos de Profei (https://profei.com/). El anuncio rota entre ellos.
export const ADS: Ad[] = [
  {
    id: 'creativa',
    title: 'Creativa Barcelona',
    subtitle: 'Salón de las Manualidades y Artesanías · 5–8 nov · La Farga de L’Hospitalet',
    href: 'https://creativabarcelona.com/',
    until: '2026-11-09',
  },
  {
    id: 'firagran',
    title: 'FiraGran 2027',
    subtitle: 'Salón de las Personas Mayores de Cataluña · 28–30 abril · Barcelona',
    href: 'https://firagran.com/salo-de-la-gent-gran-de-catalunya/',
  },
  {
    id: 'cuida',
    title: 'Cuida 2027',
    subtitle: 'Feria de profesionales en atención y cuidado de personas mayores · 28–29 abril',
    href: 'https://expocuida.com/',
  },
  {
    id: 'profei',
    title: 'Profei',
    subtitle: 'Creamos y organizamos eventos · desde 1992',
    href: 'https://profei.com/',
  },
]

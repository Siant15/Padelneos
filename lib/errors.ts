// Los mensajes que definimos nosotros en funciones/triggers de la
// base de datos (raise exception '...') ya vienen en español y se
// pueden enseñar tal cual. Pero cualquier fallo que no pase por ahí
// (violación de una restricción que no anticipamos, error de red, de
// PostgREST, del propio driver...) llega en inglés y muy técnico — en
// vez de enseñárselo a un jugador de pádel, se sustituye por un
// mensaje genérico. La heurística: si el texto contiene palabras
// españolas habituales, se asume que es uno de los nuestros.
const SPANISH_MARKERS = [
  ' no ', ' se ', ' el ', ' la ', ' los ', ' las ', ' ya ', ' para ', ' que ',
  ' de ', ' del ', ' una ', ' un ', ' hay ', 'está', 'puede', 'jornada',
  'apostar', 'ficha', 'pregunta', 'partido', 'mercado', 'resultado', 'cerrado',
]

export function friendlyError(raw: string | null | undefined, fallback = 'No se pudo completar la acción. Inténtalo de nuevo.'): string {
  if (!raw) return fallback
  const padded = ` ${raw.toLowerCase()} `
  const looksLikeOurs = SPANISH_MARKERS.some(marker => padded.includes(marker))
  return looksLikeOurs ? raw : fallback
}

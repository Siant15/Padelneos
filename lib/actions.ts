'use server'

import { updateTag } from 'next/cache'

// Las consultas de liga (lib/supabase/cached.ts) se cachean unos
// segundos para que navegar entre pestañas sea rápido — pero eso significa
// que, sin esto, un cambio recién guardado (día/hora/club, resultado,
// emparejamiento...) no se vería hasta que la caché expirase sola.
// updateTag (no revalidateTag) porque queremos que quien acaba de guardar
// vea su propio cambio al instante, no una versión aún en caché mientras
// se refresca de fondo. Cada pantalla que modifica jornadas/partidos
// llama a esto justo después de guardar.
export async function revalidateLigaData() {
  updateTag('liga-data')
}

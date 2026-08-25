import { redirect } from 'next/navigation'

// Ruta antigua, mantenida solo por compatibilidad con enlaces/marcadores
// guardados — la pantalla real de apuestas vive siempre en
// Liga → Apuestas (misma UI para cualquier jornada, con la explicación,
// el selector de jornada y "Añadir más preguntas").
export default async function ApuestasRedirectPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params
  redirect(`/liga?tab=apuestas&round=${roundId}`)
}

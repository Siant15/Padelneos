import { connection } from 'next/server'
import ResetPasswordForm from '@/components/ResetPasswordForm'

export default async function ResetPasswordPage() {
  // Fuerza render dinámico por petición: necesario para que la CSP con
  // nonce (proxy.ts) se aplique, y para procesar el token de recuperación.
  await connection()
  return <ResetPasswordForm />
}

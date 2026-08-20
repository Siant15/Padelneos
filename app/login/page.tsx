import { connection } from 'next/server'
import LoginForm from '@/components/LoginForm'

export default async function LoginPage() {
  // Fuerza render dinámico por petición: la CSP con nonce (generada en
  // proxy.ts) solo se aplica a páginas que no se sirven pre-renderizadas.
  await connection()
  return <LoginForm />
}

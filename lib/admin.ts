// Único admin de la liga — no hay sistema de roles en la base de
// datos, así que esto es una comprobación directa por email, tanto en
// la UI (qué se muestra) como en cada acción de servidor (qué se
// permite ejecutar de verdad).
export const ADMIN_EMAIL = 's.vallve93@gmail.com'

export function isAdminUser(user: { email?: string | null } | null | undefined): boolean {
  return user?.email === ADMIN_EMAIL
}

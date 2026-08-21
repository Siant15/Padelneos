// Las páginas de admin/jornadas/[id]/* (editar, resultado, mercados)
// no traían su propio margen horizontal — a diferencia del resto de
// pantallas (Inicio, Liga, Perfil), que sí lo añaden cada una — así que
// en móvil el contenido quedaba pegado a los bordes de la pantalla.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="px-5 pt-5 pb-6">{children}</div>
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type Dificultad = 'facil' | 'intermedio' | 'dificil'

export type ItemBiblioteca = {
  id: string
  nombre: string
  url: string
}

export type Biblioteca = Record<Dificultad, ItemBiblioteca[]>

// Público (como /proveedores) — esquemáticos de ejemplo, nada sensible.
export async function obtenerBiblioteca(): Promise<Biblioteca> {
  const res = await fetch(`${API_URL}/biblioteca-esquematicos`)
  if (!res.ok) throw new Error('No se pudo cargar la biblioteca de esquemáticos.')
  return (await res.json()) as Biblioteca
}

import type { Instruccion, Netlist } from '../circuit/types'
import type { Sesion } from '../ui/tipos'
import { fetchAutenticado } from './auth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// Resumen de sesión para el historial del sidebar (endpoint GET /sesiones).
export type SesionResumen = { id: string; nombre: string; fecha: string | null }

// Resultado de GET /sesiones/buscar — igual que SesionResumen más el
// fragmento del mensaje donde apareció la búsqueda (estilo WhatsApp). Sin
// fragmento cuando la coincidencia fue solo en el nombre de la conversación.
export type ResultadoBusqueda = { id: string; nombre: string; fecha: string | null; fragmento: string | null }

type SesionResumenAPI = { id: string; nombre: string; fecha: string | null; modo_detectado: string | null }

type SesionCompletaAPI = {
  id: string
  nombre: string
  netlist: Netlist | null
  instrucciones: Instruccion[] | null
  modo_detectado: string | null
  metricas: Record<string, unknown> | null
  fecha: string | null
  historial: { rol: 'user' | 'assistant'; contenido: string }[]
  imagen_esquema: string | null
}

// Crea la sesión en la BD y devuelve su id. El backend (POST /sesiones) exige
// netlist + instrucciones; modo/metricas/imagen son opcionales.
export async function crearSesion(datos: {
  nombre: string
  netlist: Netlist
  instrucciones: Instruccion[]
  // Data URL ya comprimida (~1200px) — ver comprimirImagen en Bienvenida.tsx.
  imagenEsquema?: string
}): Promise<string> {
  const res = await fetchAutenticado(`${API_URL}/sesiones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: datos.nombre,
      netlist: datos.netlist,
      instrucciones: datos.instrucciones,
      modo: null,
      metricas: null,
      imagen_esquema: datos.imagenEsquema ?? null,
    }),
  })
  if (!res.ok) throw new Error('No se pudo guardar la sesión.')
  const data = await res.json()
  return data.sesion_id as string
}

// Lista las sesiones del usuario (más recientes primero).
export async function listarSesiones(): Promise<SesionResumen[]> {
  const res = await fetchAutenticado(`${API_URL}/sesiones`)
  if (!res.ok) throw new Error('No se pudo cargar el historial.')
  const data: SesionResumenAPI[] = await res.json()
  return data.map((s) => ({ id: s.id, nombre: s.nombre, fecha: s.fecha }))
}

// Busca conversaciones por nombre O por contenido de sus mensajes (GET
// /sesiones/buscar?q=). Vacío o solo espacios → lista vacía (evita traer
// "todo" con una consulta sin sentido).
export async function buscarSesiones(q: string): Promise<ResultadoBusqueda[]> {
  const limpio = q.trim()
  if (!limpio) return []

  const res = await fetchAutenticado(`${API_URL}/sesiones/buscar?q=${encodeURIComponent(limpio)}`)
  if (!res.ok) throw new Error('No se pudo buscar en el historial.')
  return (await res.json()) as ResultadoBusqueda[]
}

// Renombra una conversación (PATCH /sesiones/{id}).
export async function renombrarSesion(id: string, nombre: string): Promise<void> {
  const res = await fetchAutenticado(`${API_URL}/sesiones/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre }),
  })
  if (!res.ok) throw new Error('No se pudo renombrar la conversación.')
}

// Borra una conversación y su historial de chat (DELETE /sesiones/{id}, en
// cascada por ondelete="CASCADE"). Irreversible — el llamador debe confirmar
// con el usuario antes de invocar esta función.
export async function borrarSesion(id: string): Promise<void> {
  const res = await fetchAutenticado(`${API_URL}/sesiones/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('No se pudo borrar la conversación.')
}

// Abre una sesión guardada y la convierte al shape de Sesion del frontend.
// La BD no persiste proveedor/nivel, así que se pasan por defecto (nivel
// viene del perfil del usuario). El esquemático sí se restaura si se guardó.
export async function abrirSesion(
  id: string,
  defaults: { proveedor: string; proveedorRazon: string; nivel: Sesion['nivel'] },
): Promise<Sesion> {
  const res = await fetchAutenticado(`${API_URL}/sesiones/${id}`)
  if (!res.ok) throw new Error('No se pudo abrir la sesión.')
  const s: SesionCompletaAPI = await res.json()

  const mensajes = s.historial.map((m) => ({
    de: (m.rol === 'user' ? 'tu' : 'ai') as 'ai' | 'tu',
    texto: m.contenido,
  }))

  return {
    id: s.id,
    nombre: s.nombre,
    netlist: s.netlist,
    instrucciones: s.instrucciones ?? [],
    prompt: '',
    intencion: 'armar',
    proveedor: defaults.proveedor,
    proveedorRazon: defaults.proveedorRazon,
    nivel: defaults.nivel,
    imagenEsquema: s.imagen_esquema ?? undefined,
    // Si aún no hay chat, dejamos que VistaPrincipal muestre su bienvenida.
    mensajes: mensajes.length ? mensajes : undefined,
  }
}

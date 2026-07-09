import type { Instruccion, Netlist } from '../circuit/types'
import type { Sesion } from '../ui/tipos'
import { fetchAutenticado } from './auth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// Resumen de sesión para el historial del sidebar (endpoint GET /sesiones).
export type SesionResumen = { id: string; nombre: string; fecha: string | null }

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
}

// Crea la sesión en la BD y devuelve su id. El backend (POST /sesiones) exige
// netlist + instrucciones; modo/metricas son opcionales.
export async function crearSesion(datos: {
  nombre: string
  netlist: Netlist
  instrucciones: Instruccion[]
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

// Abre una sesión guardada y la convierte al shape de Sesion del frontend.
// La BD no persiste proveedor/nivel/imagen, así que se pasan por defecto
// (nivel viene del perfil del usuario; el esquemático no se guarda en el #73).
export async function abrirSesion(
  id: string,
  defaults: { proveedor: string; nivel: Sesion['nivel'] },
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
    nivel: defaults.nivel,
    // Si aún no hay chat, dejamos que VistaPrincipal muestre su bienvenida.
    mensajes: mensajes.length ? mensajes : undefined,
  }
}

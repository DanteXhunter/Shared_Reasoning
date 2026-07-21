import type { Instruccion, Netlist, Uso } from '../circuit/types'
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

// Forma unificada de la columna `metricas` (JSONB) — la misma que consume la
// pestaña "Métricas": el análisis inicial (extractor/planner) más una lista
// con cada interacción del chat. Ver _persistir_interaccion_chat en main.py.
export type MetricasSesion = {
  extractor?: Uso
  planner?: Uso
  // tipo_interaccion: IN/ON/OVER/UNDER/ALONG diagnosticado por el LLM (#82) —
  // eje distinto de `intencion` (qué acción de chat pidió el usuario).
  chat?: { uso: Uso; intencion: string; tipo_interaccion?: string }[]
  // Tipo de interacción diagnosticado para la interacción #1 (el análisis
  // inicial, antes de cualquier turno de chat) — ver Bienvenida.tsx.
  tipoInteraccionInicial?: string
}

type SesionCompletaAPI = {
  id: string
  nombre: string
  netlist: Netlist | null
  instrucciones: Instruccion[] | null
  modo_detectado: string | null
  metricas: MetricasSesion | null
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
  // Métricas del análisis inicial (extractor + planner) para que la pestaña
  // "Métricas" sobreviva a recargar o reabrir la sesión desde el historial.
  metricas?: MetricasSesion
  // Tipo de interacción diagnosticado por el LLM para la primera interacción
  // de la sesión (#82, viene de RespuestaPlanner.tipo_interaccion_inicial) —
  // nunca un default fijo ni derivado del nivel.
  modo?: string
}): Promise<string> {
  const res = await fetchAutenticado(`${API_URL}/sesiones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: datos.nombre,
      netlist: datos.netlist,
      instrucciones: datos.instrucciones,
      modo: datos.modo ?? null,
      metricas: datos.metricas ?? null,
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

// Genera (o reutiliza) el link para compartir una sesión. Idempotente: llamar
// de nuevo devuelve el mismo token, no invalida links ya repartidos.
export async function compartirSesion(id: string): Promise<string> {
  const res = await fetchAutenticado(`${API_URL}/sesiones/${id}/compartir`, { method: 'POST' })
  if (!res.ok) throw new Error('No se pudo generar el link para compartir.')
  const data = await res.json()
  return data.token as string
}

export type VistaPreviaCompartida = { nombre: string; fecha: string | null; cantidadMensajes: number }

// Preview de una sesión compartida (por su token) antes de importarla — no
// trae el netlist/instrucciones/historial completos, solo lo necesario para
// que el usuario decida si quiere traérsela a su cuenta.
export async function obtenerVistaPreviaCompartida(token: string): Promise<VistaPreviaCompartida> {
  const res = await fetchAutenticado(`${API_URL}/sesiones/compartidas/${token}`)
  if (!res.ok) throw new Error('Este link de circuito compartido no es válido.')
  const data = await res.json()
  return { nombre: data.nombre, fecha: data.fecha, cantidadMensajes: data.cantidad_mensajes }
}

// Trae una COPIA independiente de la sesión compartida a la cuenta del
// usuario actual (netlist + instrucciones + historial de chat hasta ese
// momento) y devuelve el id de la nueva sesión ya creada.
export async function importarSesionCompartida(token: string): Promise<string> {
  const res = await fetchAutenticado(`${API_URL}/sesiones/compartidas/${token}/importar`, { method: 'POST' })
  if (!res.ok) throw new Error('No se pudo importar el circuito compartido.')
  const data = await res.json()
  return data.sesion_id as string
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
    // Métricas persistidas (análisis inicial + interacciones del chat) para
    // que la pestaña "Métricas" no aparezca vacía al reabrir la sesión.
    metricasProceso: s.metricas ?? undefined,
  }
}

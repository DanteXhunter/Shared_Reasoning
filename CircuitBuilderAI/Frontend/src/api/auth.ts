import type { Nivel } from '../ui/tipos'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const CLAVE_TOKEN = 'paralelo_token'

export type Usuario = {
  usuarioId: string
  nombre: string
  nivel: Nivel
  nivelConfirmado: boolean
}

// Callback opcional que App.tsx registra para reaccionar cuando el token
// expira o deja de ser válido (ver fetchAutenticado). Evita meter una
// librería de manejo de estado global solo para esto.
let onSesionExpirada: (() => void) | null = null
export function alExpirarSesion(callback: () => void) {
  onSesionExpirada = callback
}

export function guardarToken(token: string) {
  localStorage.setItem(CLAVE_TOKEN, token)
}

export function obtenerToken(): string | null {
  return localStorage.getItem(CLAVE_TOKEN)
}

export function borrarToken() {
  localStorage.removeItem(CLAVE_TOKEN)
}

// Extrae el mensaje de error legible de una respuesta de FastAPI (detail
// string, o {mensaje, errores}, siguiendo el mismo patrón que analizar.ts).
async function mensajeDeError(res: Response): Promise<string> {
  const data = await res.json().catch(() => null)
  const detalle = data?.detail
  if (typeof detalle === 'string') return detalle
  if (Array.isArray(detalle)) {
    // Errores de validación de Pydantic: [{msg: "..."}]
    return detalle.map((e: { msg?: string }) => e.msg).filter(Boolean).join('; ') || res.statusText
  }
  return detalle?.mensaje ?? res.statusText
}

type RespuestaToken = {
  access_token: string
  usuario_id: string
  nombre: string
  nivel: Nivel
  nivel_confirmado: boolean
}

function aUsuario(datos: RespuestaToken): Usuario {
  guardarToken(datos.access_token)
  return {
    usuarioId: datos.usuario_id,
    nombre: datos.nombre,
    nivel: datos.nivel,
    nivelConfirmado: datos.nivel_confirmado,
  }
}

export async function registrar(nombre: string, email: string, contrasena: string): Promise<Usuario> {
  const res = await fetch(`${API_URL}/auth/registro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, email, contrasena }),
  })
  if (!res.ok) throw new Error(await mensajeDeError(res))
  return aUsuario(await res.json())
}

export async function login(email: string, contrasena: string): Promise<Usuario> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, contrasena }),
  })
  if (!res.ok) throw new Error(await mensajeDeError(res))
  return aUsuario(await res.json())
}

export async function actualizarNivel(nivel: Nivel): Promise<void> {
  const res = await fetchAutenticado(`${API_URL}/auth/nivel`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nivel }),
  })
  if (!res.ok) throw new Error(await mensajeDeError(res))
}

// Wrapper de fetch que agrega el header Authorization automáticamente.
// Lo usan analizar.ts, planificar.ts y chat.ts en vez de fetch directo.
// Si el token falta o el backend responde 401, dispara alExpirarSesion().
export async function fetchAutenticado(url: string, opciones: RequestInit = {}): Promise<Response> {
  const token = obtenerToken()
  const headers = new Headers(opciones.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(url, { ...opciones, headers })

  if (res.status === 401) {
    borrarToken()
    onSesionExpirada?.()
  }

  return res
}

type RespuestaUsuario = {
  usuario_id: string
  nombre: string
  nivel: Nivel
  nivel_confirmado: boolean
}

// Para restaurar la sesión al recargar la página: si hay un token guardado,
// confirma con el backend que sigue siendo válido y trae los datos del
// usuario. Devuelve null si no hay token o si ya no es válido (sin lanzar
// error — es un caso esperado, no una falla).
export async function obtenerUsuarioActual(): Promise<Usuario | null> {
  if (!obtenerToken()) return null

  const res = await fetchAutenticado(`${API_URL}/auth/me`)
  if (!res.ok) return null

  const datos: RespuestaUsuario = await res.json()
  return {
    usuarioId: datos.usuario_id,
    nombre: datos.nombre,
    nivel: datos.nivel,
    nivelConfirmado: datos.nivel_confirmado,
  }
}

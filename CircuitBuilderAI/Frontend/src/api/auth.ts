import type { Nivel } from '../ui/tipos'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const CLAVE_TOKEN = 'paralelo_token'

// Flags de "¿hay una key propia guardada para este proveedor?" — nunca el
// valor de la key (el backend nunca la devuelve, ver PATCH /auth/api-keys).
export type ApiKeysConfiguradas = {
  openai: boolean
  gemini: boolean
  nvidia: boolean
}

export type Usuario = {
  usuarioId: string
  nombre: string
  email: string
  nivel: Nivel
  nivelConfirmado: boolean
  // Preset del carrusel (ej. "/avatares/avatar-3.png") o data URL de una foto
  // subida. null/undefined = sin foto, se muestra la inicial del nombre.
  fotoPerfil?: string | null
  apiKeysConfiguradas: ApiKeysConfiguradas
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
  email: string
  nivel: Nivel
  nivel_confirmado: boolean
  foto_perfil?: string | null
  api_keys_configuradas: ApiKeysConfiguradas
}

function aUsuario(datos: RespuestaToken): Usuario {
  guardarToken(datos.access_token)
  return aUsuarioDesde(datos)
}

// Mapea la forma del backend (UsuarioResponse/TokenResponse) al tipo del front.
function aUsuarioDesde(datos: RespuestaUsuario): Usuario {
  return {
    usuarioId: datos.usuario_id,
    nombre: datos.nombre,
    email: datos.email,
    nivel: datos.nivel,
    nivelConfirmado: datos.nivel_confirmado,
    fotoPerfil: datos.foto_perfil,
    apiKeysConfiguradas: datos.api_keys_configuradas,
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
  email: string
  nivel: Nivel
  nivel_confirmado: boolean
  foto_perfil?: string | null
  api_keys_configuradas: ApiKeysConfiguradas
}

// Para restaurar la sesión al recargar la página: si hay un token guardado,
// confirma con el backend que sigue siendo válido y trae los datos del
// usuario. Devuelve null si no hay token o si ya no es válido (sin lanzar
// error — es un caso esperado, no una falla).
export async function obtenerUsuarioActual(): Promise<Usuario | null> {
  if (!obtenerToken()) return null

  const res = await fetchAutenticado(`${API_URL}/auth/me`)
  if (!res.ok) return null

  return aUsuarioDesde(await res.json())
}

// Actualiza nombre, correo y/o foto del usuario (PATCH /auth/perfil).
// `fotoPerfil: ''` quita la foto (vuelve a la inicial); undefined no la toca.
// Devuelve el usuario ya actualizado para refrescar la UI.
export async function actualizarPerfil(datos: { nombre?: string; email?: string; fotoPerfil?: string }): Promise<Usuario> {
  const res = await fetchAutenticado(`${API_URL}/auth/perfil`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: datos.nombre, email: datos.email, foto_perfil: datos.fotoPerfil }),
  })
  if (!res.ok) throw new Error(await mensajeDeError(res))
  return aUsuarioDesde(await res.json())
}

// Cambia la contraseña (PATCH /auth/contrasena). El backend verifica la actual.
export async function cambiarContrasena(contrasenaActual: string, contrasenaNueva: string): Promise<void> {
  const res = await fetchAutenticado(`${API_URL}/auth/contrasena`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contrasena_actual: contrasenaActual, contrasena_nueva: contrasenaNueva }),
  })
  if (!res.ok) throw new Error(await mensajeDeError(res))
}

// Claves del catálogo que la key propia de cada grupo (openai/gemini/nvidia)
// puede usar — se calcula en vivo contra el /models real de cada proveedor
// (ver GET /auth/modelos-disponibles). Un grupo ausente en el resultado
// significa "sin key propia configurada"; ahí el front cae al flag del
// servidor, igual que antes de este feature.
//
// "sin_verificar" (solo pasa hoy con Gemini): el listado del proveedor SÍ
// muestra el modelo, pero no se pudo confirmar con una llamada de prueba si
// la key tiene facturación — Google le da a TODA key una cuota gratuita de
// cortesía, así que una key sin facturación responde igual que una que sí
// paga hasta que esa cuota se gasta de verdad con uso real. No es ni
// "disponible" ni "bloqueado": mostrarlo como disponible sería engañoso.
export type DisponibilidadGrupo = { confirmados: string[]; sin_verificar: string[] }
export type ModelosDisponiblesUsuario = Record<string, DisponibilidadGrupo>

// Se pide una sola vez por pantalla (no una por cada SelectorModelo montado)
// porque dispara una llamada real a cada proveedor con la key del usuario.
export async function obtenerModelosDisponibles(): Promise<ModelosDisponiblesUsuario> {
  const res = await fetchAutenticado(`${API_URL}/auth/modelos-disponibles`)
  if (!res.ok) throw new Error(await mensajeDeError(res))
  return (await res.json()) as ModelosDisponiblesUsuario
}

// Guarda las API keys propias del usuario (PATCH /auth/api-keys), cifradas en
// el backend — nunca viajan de vuelta. Cada campo: undefined = no tocar esa
// key, '' = borrarla, cualquier otro valor = guardarla. Devuelve el usuario
// actualizado (con los flags apiKeysConfiguradas ya reflejando el cambio).
export async function actualizarApiKeys(datos: { openai?: string; gemini?: string; nvidia?: string }): Promise<Usuario> {
  const res = await fetchAutenticado(`${API_URL}/auth/api-keys`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  })
  if (!res.ok) throw new Error(await mensajeDeError(res))
  return aUsuarioDesde(await res.json())
}

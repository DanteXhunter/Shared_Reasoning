import type { RespuestaAnalizar } from '../circuit/types'
import { fetchAutenticado } from './auth'

// URL del backend (viene del .env: VITE_API_URL). Fallback a localhost:8000.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// Envía la imagen del esquemático al backend y devuelve el netlist. Las API
// keys propias del usuario (si las configuró en Mi cuenta) las resuelve el
// backend por su cuenta — no viajan en esta petición.
// Lanza Error con un mensaje legible si algo falla.
export async function analizarEsquematico(
  imagen: File,
  proveedor: string,
): Promise<RespuestaAnalizar> {
  const form = new FormData()
  form.append('imagen', imagen)
  form.append('proveedor', proveedor)

  const res = await fetchAutenticado(`${API_URL}/analizar`, { method: 'POST', body: form })

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    const detalle = data?.detail
    if (typeof detalle === 'string') {
      throw new Error(detalle)
    }
    const base: string = detalle?.mensaje ?? JSON.stringify(detalle ?? res.statusText)
    const errores: string[] = detalle?.errores ?? []
    const ultimoError = errores.at(-1)
    if (!ultimoError) throw new Error(base)
    // Separa cada oración del motivo en su propia línea (". Mayúscula" → salto de línea)
    const motivo = ultimoError.replace(/\. ([A-ZÁÉÍÓÚÑ])/g, '.\n$1')
    throw new Error(`${base}\nMotivo: ${motivo}`)
  }

  return data as RespuestaAnalizar
}

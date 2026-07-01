import type { RespuestaAnalizar } from '../circuit/types'

// URL del backend (viene del .env: VITE_API_URL). Fallback a localhost:8000.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// Envía la imagen del esquemático al backend y devuelve el netlist.
// Lanza Error con un mensaje legible si algo falla.
export async function analizarEsquematico(
  imagen: File,
  proveedor: string,
): Promise<RespuestaAnalizar> {
  const form = new FormData()
  form.append('imagen', imagen)
  form.append('proveedor', proveedor)

  const res = await fetch(`${API_URL}/analizar`, { method: 'POST', body: form })

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    // FastAPI manda el error en "detail" (string u objeto)
    const detalle = data?.detail
    const mensaje =
      typeof detalle === 'string'
        ? detalle
        : detalle?.mensaje ?? JSON.stringify(detalle ?? res.statusText)
    throw new Error(mensaje)
  }

  return data as RespuestaAnalizar
}

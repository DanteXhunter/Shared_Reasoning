import type { Instruccion, Netlist, Uso } from '../circuit/types'
import { fetchAutenticado } from './auth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type MensajeHistorial = { rol: 'user' | 'assistant'; contenido: string }

export type EventoChat =
  | { tipo: 'estado'; mensaje: string }
  | { tipo: 'respuesta'; contenido: string; intencion_detectada: string; uso?: Uso }
  | {
      tipo: 'actualizado'
      respuesta: string
      intencion_detectada: string
      instrucciones_actualizadas: Instruccion[] | null
      netlist_modificado: Netlist | null
      posiciones_modificadas: Record<string, number> | null
      uso?: Uso
    }
  | { tipo: 'error'; mensaje: string }

export async function enviarMensajeChat(params: {
  netlist: Netlist
  historial: MensajeHistorial[]
  proveedor: string
  // Modelo de razonamiento: clasifica, modifica netlist/posiciones y responde
  // — todo el trabajo del chat, que no involucra leer la imagen.
  proveedorRazon: string
  nivel: string
  instrucciones: Instruccion[]
  // Si viene, el backend persiste el par usuario/asistente en esa sesión (#73).
  sesionId?: string
  onEvento: (evento: EventoChat) => void
}): Promise<void> {
  const { netlist, historial, proveedor, proveedorRazon, nivel, instrucciones, sesionId, onEvento } = params

  const form = new FormData()
  form.append('netlist', JSON.stringify(netlist))
  form.append('historial', JSON.stringify(historial))
  form.append('proveedor', proveedor)
  form.append('proveedor_razon', proveedorRazon)
  form.append('nivel', nivel)
  form.append('instrucciones', JSON.stringify(instrucciones))
  if (sesionId) form.append('sesion_id', sesionId)

  const res = await fetchAutenticado(`${API_URL}/chat`, { method: 'POST', body: form })

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null)
    const detalle = data?.detail
    const mensaje = typeof detalle === 'string' ? detalle : JSON.stringify(detalle ?? res.statusText)
    onEvento({ tipo: 'error', mensaje })
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const bloques = buffer.split('\n\n')
    buffer = bloques.pop() ?? ''

    for (const bloque of bloques) {
      const linea = bloque.replace(/^data: /, '').trim()
      if (!linea) continue
      try {
        const evento = JSON.parse(linea) as EventoChat
        onEvento(evento)
      } catch {
        // bloque SSE malformado, ignorar
      }
    }
  }
}

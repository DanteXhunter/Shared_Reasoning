import type { RespuestaPlanner, Netlist } from '../circuit/types'
import { fetchAutenticado } from './auth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// Envía el netlist al planner y devuelve las instrucciones paso a paso
// (con coordenadas reales de protoboard). La geometría es determinística en el
// backend; `nivel` (basico|intermedio|experto) ajusta la verbosidad del texto.
export async function planificarCircuito(
  netlist: Netlist,
  proveedor: string,
  proveedorRazon: string,
  nivel: string,
): Promise<RespuestaPlanner> {
  const form = new FormData()
  form.append('proveedor', proveedor)
  form.append('proveedor_razon', proveedorRazon)
  form.append('nivel', nivel)
  form.append('netlist', JSON.stringify(netlist))

  const res = await fetchAutenticado(`${API_URL}/planificar`, { method: 'POST', body: form })
  const data = await res.json().catch(() => null)

  if (!res.ok) {
    const detalle = data?.detail
    const mensaje =
      typeof detalle === 'string'
        ? detalle
        : detalle?.mensaje ?? JSON.stringify(detalle ?? res.statusText)
    throw new Error(mensaje)
  }

  return data as RespuestaPlanner
}

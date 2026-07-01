// ============================================================
//  Tipos del netlist — deben calzar con schemas/netlist.py del backend.
//  El backend devuelve: { resultado: Netlist, uso: {...}, metricas: {...} }
// ============================================================

export type Pin = { nombre: string; funcion: string }

export type Componente = {
  id: string
  tipo: string
  valor: string
  unidad: string
  propiedades?: Record<string, unknown> | null
  pines: Pin[]
}

export type Conexion = { de: string; a: string; descripcion?: string | null }

export type Netlist = {
  componentes: Componente[]
  conexiones: Conexion[]
}

// Respuesta completa del endpoint /analizar
export type RespuestaAnalizar = {
  resultado?: Netlist
  error?: boolean
  mensaje?: string
  uso?: Record<string, unknown>
  metricas?: Record<string, unknown>
}

// ---- Tipos del renderizado (lo que Konva dibuja) ----

// Un componente ya colocado en píxeles, listo para el catálogo.
export type ComponentePlano = {
  id: string
  kind: 'resistor' | 'led' | 'capacitor' | 'source' | 'switch' | 'bulb' | 'generic'
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
}

// Un cable de conexión ya resuelto en píxeles.
export type CablePlano = { x1: number; y1: number; x2: number; y2: number }

// Un nodo (net con nombre: V_in, V_out, GND, VCC...) colocado en píxeles.
export type NodoPlano = { x: number; y: number; label: string; color: string }

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

// Un cable de conexión ya resuelto en píxeles (color opcional).
export type CablePlano = { x1: number; y1: number; x2: number; y2: number; color?: string }

// ---- Salida del PLANNER (paso a paso con coordenadas reales) ----
// OJO: el planner usa fila=número y columna=letra (invertido a grid.ts).
export type PuntoPlanner = { fila: number; columna: string }
export type PinPlanner = { nombre: string; fila: number; columna: string }
export type CablePlanner = { color: string; desde: PuntoPlanner; hasta: PuntoPlanner }

export type Instruccion = {
  numero: number
  tipo: string // "colocar_componente" | "conectar_cable"
  componente_id: string | null
  componente_tipo: string | null
  componente_valor: string | null
  descripcion: string
  pines: PinPlanner[] | null
  cable: CablePlanner | null
}

export type RespuestaPlanner = {
  instrucciones?: Instruccion[]
  error?: boolean
  mensaje?: string
  uso?: Record<string, unknown>
  metricas?: Record<string, unknown>
}

// Un nodo (net con nombre: V_in, V_out, GND, VCC...) colocado en píxeles.
export type NodoPlano = { x: number; y: number; label: string; color: string }

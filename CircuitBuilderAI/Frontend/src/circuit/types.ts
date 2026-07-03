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

// Estado visual de un item según el paso a paso:
//  activo = el del paso actual (resaltado) · previo = ya colocado (atenuado) · normal = todo visible igual.
export type EstadoItem = 'activo' | 'previo' | 'normal'

// Un componente ya colocado en píxeles, listo para el catálogo.
export type ComponentePlano = {
  estado?: EstadoItem
  id: string
  kind:
    | 'resistor' | 'led' | 'diode' | 'transistor' | 'capacitor' | 'electrolytic'
    | 'inductor' | 'fuse' | 'potentiometer' | 'pushbutton' | 'ic'
    | 'source' | 'switch' | 'bulb' | 'generic'
  x1: number
  y1: number
  x2: number
  y2: number
  x3?: number // 3ra pata (ej. base de un transistor) — solo la usan componentes de 3 patas
  y3?: number
  label: string
  // Datos crudos para componentes que se auto-detallan (ej. resistor → bandas de color).
  valor?: string
  tolerancia?: string
  potenciaNominal?: string
}

// Un cable de conexión ya resuelto en píxeles (color opcional).
export type CablePlano = { x1: number; y1: number; x2: number; y2: number; color?: string; estado?: EstadoItem }

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

// Una batería/fuente FÍSICA: no va en un hueco, se dibuja al borde y
// energiza los rieles (+ y −). El id/valor vienen del netlist.
export type BateriaPlano = { id: string; valor?: string }

import { holePos, railHoleX, ROWS, TOP_PLUS_Y, TOP_MINUS_Y } from './grid'
import type { Netlist, ComponentePlano, CablePlano, NodoPlano, Instruccion } from './types'

// ============================================================
//  Auto-layout PROVISIONAL.
//  El netlist del backend no trae coordenadas de protoboard,
//  así que aquí colocamos los componentes y nodos de forma
//  automática para poder verlos. Cuando el "planner" del backend
//  entregue coordenadas reales, se reemplaza esta función.
//
//  Ojo: en el netlist, cosas como V_in / V_out / GND NO son
//  componentes, son NODOS (nets con nombre). Aquí se dibujan
//  como terminales etiquetadas para que el circuito se vea completo.
// ============================================================

function normalizarTipo(tipo: string): ComponentePlano['kind'] {
  const t = tipo.toLowerCase()
  if (t.includes('resist')) return 'resistor'
  if (t.includes('led') || t.includes('diodo')) return 'led'
  if (t.includes('capacit') || t.includes('condensador')) return 'capacitor'
  if (t.includes('fuente') || t.includes('generador') || t.includes('bateria') || t.includes('pila')) return 'source'
  if (t.includes('interruptor') || t.includes('switch') || t.includes('boton')) return 'switch'
  if (t.includes('carga') || t.includes('bombilla') || t.includes('lampara') || t.includes('foco') || t.includes('luz')) return 'bulb'
  return 'generic'
}

// Color de un nodo según su nombre (alimentación, tierra, o señal).
function colorNodo(nombre: string): string {
  const n = nombre.toUpperCase()
  if (n.includes('GND') || n === '-') return '#334155'                           // tierra: gris oscuro
  if (n.includes('VCC') || n.includes('VIN') || n.includes('V_IN') || n === '+') return '#e11d48' // alimentación: rojo
  return '#0891b2'                                                                // señal (V_out...): cian
}

const COMPONENTES_POR_FILA = 4
const FILAS = ['B', 'D', 'H', 'J']
const COL_INICIAL = 3
const SEPARACION_COL = 6
const ANCHO_COMPONENTE = 3
const FILA_NODOS = 'A' // los nodos van en la fila superior

export function autoLayout(netlist: Netlist): {
  componentes: ComponentePlano[]
  cables: CablePlano[]
  nodos: NodoPlano[]
} {
  const componentes: ComponentePlano[] = []
  const mapaPines = new Map<string, { x: number; y: number }>()

  netlist.componentes.forEach((comp, i) => {
    const fila = FILAS[Math.floor(i / COMPONENTES_POR_FILA) % FILAS.length]
    const col = COL_INICIAL + (i % COMPONENTES_POR_FILA) * SEPARACION_COL
    const a = holePos(fila, col)
    const b = holePos(fila, col + ANCHO_COMPONENTE)

    componentes.push({
      id: comp.id,
      kind: normalizarTipo(comp.tipo),
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      label: `${comp.id} ${comp.valor}${comp.unidad ?? ''}`.trim(),
    })

    if (comp.pines[0]) mapaPines.set(`${comp.id}.${comp.pines[0].nombre}`, a)
    if (comp.pines[1]) mapaPines.set(`${comp.id}.${comp.pines[1].nombre}`, b)
  })

  // Ubica cualquier extremo de conexión: si es pin de componente usa su hueco;
  // si es un nodo con nombre, le asigna (una sola vez) una terminal en la fila superior.
  const mapaNodos = new Map<string, { x: number; y: number }>()
  const nodos: NodoPlano[] = []

  function ubicar(extremo: string): { x: number; y: number } {
    const pin = mapaPines.get(extremo)
    if (pin) return pin

    const existente = mapaNodos.get(extremo)
    if (existente) return existente

    const col = COL_INICIAL + mapaNodos.size * SEPARACION_COL
    const pos = holePos(FILA_NODOS, col)
    mapaNodos.set(extremo, pos)
    nodos.push({ x: pos.x, y: pos.y, label: extremo, color: colorNodo(extremo) })
    return pos
  }

  // Ahora TODAS las conexiones se dibujan (pin↔pin, pin↔nodo, nodo↔nodo).
  const cables: CablePlano[] = netlist.conexiones.map((con) => {
    const desde = ubicar(con.de)
    const hasta = ubicar(con.a)
    return { x1: desde.x, y1: desde.y, x2: hasta.x, y2: hasta.y }
  })

  return { componentes, cables, nodos }
}

// ============================================================
//  RENDER DESDE EL PLANNER (coordenadas REALES, no auto-layout).
//  El planner habla en fila=número, columna=letra (invertido a grid.ts),
//  así que aquí se traduce a mis coordenadas holePos(letra, número).
// ============================================================

// ¿La columna del planner es un riel de poder?
function esRailCol(columna: string): boolean {
  const c = columna.trim()
  return c === '+' || c === '-'
}

// Traduce una coordenada del planner a píxeles. null si no es válida.
function coordPlanner(fila: number, columna: string): { x: number; y: number } | null {
  const col = columna.trim().toLowerCase()
  if (col === '+' || col === '-') {
    return { x: railHoleX(Math.max(1, fila)), y: col === '+' ? TOP_PLUS_Y : TOP_MINUS_Y }
  }
  const letra = col.toUpperCase()
  if (!ROWS.includes(letra)) return null
  return holePos(letra, fila) // planner: fila=número→columna mía, columna=letra→fila mía
}

// Nombre de color en español → hex.
function colorCable(nombre: string): string {
  const c = (nombre ?? '').toLowerCase()
  if (c.includes('amarillo')) return '#eab308'
  if (c.includes('negro')) return '#1f2937'
  if (c.includes('rojo')) return '#dc2626'
  if (c.includes('azul')) return '#2563eb'
  if (c.includes('verde')) return '#16a34a'
  if (c.includes('naranja')) return '#ea580c'
  if (c.includes('blanco')) return '#e5e7eb'
  return '#16a34a'
}

export function layoutDesdeInstrucciones(instrucciones: Instruccion[]): {
  componentes: ComponentePlano[]
  cables: CablePlano[]
} {
  const componentes: ComponentePlano[] = []
  const cables: CablePlano[] = []

  for (const ins of instrucciones) {
    if (ins.tipo === 'colocar_componente' && ins.pines && ins.pines.length >= 2) {
      const a = coordPlanner(ins.pines[0].fila, ins.pines[0].columna)
      const b = coordPlanner(ins.pines[1].fila, ins.pines[1].columna)
      if (a && b) {
        componentes.push({
          id: ins.componente_id ?? `C${ins.numero}`,
          kind: normalizarTipo(ins.componente_tipo ?? ''),
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          label: `${ins.componente_id ?? ''} ${ins.componente_valor ?? ''}`.trim(),
        })
      }
    } else if (ins.tipo === 'conectar_cable' && ins.cable) {
      const { desde, hasta, color } = ins.cable
      const desdeRail = esRailCol(desde.columna)
      const hastaRail = esRailCol(hasta.columna)
      let a = desdeRail ? null : coordPlanner(desde.fila, desde.columna)
      let b = hastaRail ? null : coordPlanner(hasta.fila, hasta.columna)
      // Un extremo en riel cae vertical usando la X del otro extremo.
      if (desdeRail) a = { x: b?.x ?? railHoleX(Math.max(1, desde.fila)), y: desde.columna.includes('+') ? TOP_PLUS_Y : TOP_MINUS_Y }
      if (hastaRail) b = { x: a?.x ?? railHoleX(Math.max(1, hasta.fila)), y: hasta.columna.includes('+') ? TOP_PLUS_Y : TOP_MINUS_Y }
      if (a && b) cables.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: colorCable(color) })
    }
  }

  return { componentes, cables }
}

// Instrucciones de ejemplo del planner (divisor) idénticas a las de la IA.
export const EJEMPLO_PLANNER: Instruccion[] = [
  { numero: 1, tipo: 'colocar_componente', componente_id: 'R1', componente_tipo: 'resistencia', componente_valor: '10k', descripcion: 'Coloca R1 en fila 1, columnas b y g.', pines: [{ nombre: 'pin1', fila: 1, columna: 'b' }, { nombre: 'pin2', fila: 1, columna: 'g' }], cable: null },
  { numero: 2, tipo: 'colocar_componente', componente_id: 'R2', componente_tipo: 'resistencia', componente_valor: '10k', descripcion: 'Coloca R2 en fila 3, columnas b y g.', pines: [{ nombre: 'pin1', fila: 3, columna: 'b' }, { nombre: 'pin2', fila: 3, columna: 'g' }], cable: null },
  { numero: 3, tipo: 'conectar_cable', componente_id: null, componente_tipo: null, componente_valor: null, descripcion: 'Cable amarillo de R1 (1,g) a R2 (3,b).', pines: null, cable: { color: 'amarillo', desde: { fila: 1, columna: 'g' }, hasta: { fila: 3, columna: 'b' } } },
  { numero: 4, tipo: 'conectar_cable', componente_id: null, componente_tipo: null, componente_valor: null, descripcion: 'Cable negro de R2 (3,g) al riel negativo.', pines: null, cable: { color: 'negro', desde: { fila: 3, columna: 'g' }, hasta: { fila: 0, columna: '-' } } },
]

// Netlist de ejemplo (divisor de voltaje) idéntico al que devuelve la IA.
export const EJEMPLO_DIVISOR: Netlist = {
  componentes: [
    { id: 'R1', tipo: 'resistencia', valor: '10k', unidad: 'ohm', pines: [{ nombre: 'pin1', funcion: 'terminal_a' }, { nombre: 'pin2', funcion: 'terminal_b' }] },
    { id: 'R2', tipo: 'resistencia', valor: '10k', unidad: 'ohm', pines: [{ nombre: 'pin1', funcion: 'terminal_a' }, { nombre: 'pin2', funcion: 'terminal_b' }] },
  ],
  conexiones: [
    { de: 'R1.pin1', a: 'V_in', descripcion: 'conexión a entrada de voltaje' },
    { de: 'R1.pin2', a: 'R2.pin1', descripcion: 'conexión entre R1 y R2' },
    { de: 'R2.pin2', a: 'GND', descripcion: 'conexión a tierra' },
    { de: 'R1.pin2', a: 'V_out', descripcion: 'conexión a salida de voltaje' },
  ],
}

// Netlist de ejemplo (fuente + interruptor + bombilla) idéntico al de la IA.
export const EJEMPLO_LAMPARA: Netlist = {
  componentes: [
    { id: 'Generador', tipo: 'fuente', valor: '5', unidad: 'V', pines: [{ nombre: 'positivo', funcion: 'VCC' }, { nombre: 'negativo', funcion: 'GND' }] },
    { id: 'Interruptor', tipo: 'interruptor', valor: '', unidad: '', pines: [{ nombre: 'pin1', funcion: 'entrada' }, { nombre: 'pin2', funcion: 'salida' }] },
    { id: 'Bombilla', tipo: 'carga', valor: '60', unidad: 'W', pines: [{ nombre: 'anodo', funcion: 'entrada' }, { nombre: 'catodo', funcion: 'salida' }] },
  ],
  conexiones: [
    { de: 'Generador.positivo', a: 'Interruptor.pin1' },
    { de: 'Interruptor.pin2', a: 'Bombilla.anodo' },
    { de: 'Bombilla.catodo', a: 'Generador.negativo' },
  ],
}

import { holePos, railHoleX, ROWS, TOP_PLUS_Y, TOP_MINUS_Y } from './grid'
import type { Netlist, ComponentePlano, CablePlano, NodoPlano, Instruccion, BateriaPlano, EstadoItem } from './types'

// Punto de conexión a los rieles de poder (columna 2, cerca del borde izq).
const RAIL_PLUS = { x: railHoleX(2), y: TOP_PLUS_Y }
const RAIL_MINUS = { x: railHoleX(2), y: TOP_MINUS_Y }

// ¿Un pin de la fuente es el positivo? (por su función o nombre)
function esPinPositivo(texto: string): boolean {
  const t = texto.toLowerCase()
  return t.includes('vcc') || t.includes('pos') || t.includes('+') || t.includes('vin') || t.includes('v_in')
}

// ¿Un nombre de nodo es un riel de poder? Devuelve el punto del riel o null.
function railDeNodo(nombre: string): { x: number; y: number } | null {
  const u = nombre.trim().toUpperCase()
  if (u === '+' || u === 'VCC' || u.includes('VIN') || u.includes('V_IN') || u === 'V+') return RAIL_PLUS
  if (u === '-' || u === 'GND' || u === 'V-' || u === 'TIERRA') return RAIL_MINUS
  return null
}

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

export function normalizarTipo(tipo: string): ComponentePlano['kind'] {
  const t = tipo.toLowerCase()
  // OJO al ORDEN: 'fotorresistor'/'sensor de luz' contienen 'resist'/'luz',
  // así que el fotorresistor debe chequearse ANTES que resistor y bulb.
  if (t.includes('ldr') || t.includes('fotorres') || t.includes('photores') || t.includes('fotoresist') || t.includes('fotocelda')) return 'photoresistor'
  if (t.includes('resist')) return 'resistor'
  if (t.includes('led')) return 'led' // OJO: chequear 'led' ANTES que 'diodo' — un LED también es técnicamente un diodo
  if (t.includes('diodo') || t.includes('diode')) return 'diode'
  if (t.includes('7805') || t.includes('regulador') || t.includes('regulator') || t.includes('to-220') || t.includes('to220')) return 'regulator'
  if (t.includes('transistor') || t.includes('bjt') || t.includes('npn') || t.includes('pnp')) return 'transistor'
  if (t.includes('potenci') || t.includes('trimmer')) return 'potentiometer'
  if (t.includes('electrolit') || t.includes('electrolyt')) return 'electrolytic'
  if (t.includes('capacit') || t.includes('condensador')) return 'capacitor'
  if (t.includes('inductor') || t.includes('bobina')) return 'inductor'
  if (t.includes('fusible') || t.includes('fuse')) return 'fuse'
  if (t.includes('cristal') || t.includes('crystal') || t.includes('oscilador') || t.includes('xtal') || t.includes('resonador')) return 'crystal'
  if (t.includes('7 seg') || t.includes('siete seg') || t.includes('seven') || t.includes('segmento') || t.includes('display')) return 'sevenseg'
  if (t.includes('rele') || t.includes('relé') || t.includes('relay')) return 'relay'
  if (t.includes('buzzer') || t.includes('zumbador') || t.includes('piezo') || t.includes('bocina') || t.includes('altavoz') || t.includes('speaker') || t.includes('parlante')) return 'buzzer'
  if (t.includes('motor')) return 'motor'
  if (t.includes('integrado') || t.includes('chip') || /\bic\b/.test(t) || /\b555\b/.test(t) || t.includes('amp op') || t.includes('opamp')) return 'ic'
  if (t.includes('pulsador') || t.includes('push') || t.includes('boton')) return 'pushbutton'
  if (t.includes('fuente') || t.includes('generador') || t.includes('bateria') || t.includes('pila')) return 'source'
  if (t.includes('interruptor') || t.includes('switch')) return 'switch'
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
  baterias: BateriaPlano[]
} {
  const componentes: ComponentePlano[] = []
  const baterias: BateriaPlano[] = []
  const mapaPines = new Map<string, { x: number; y: number }>()

  let iGrid = 0 // índice SOLO de componentes que van al tablero (las fuentes no cuentan)
  netlist.componentes.forEach((comp) => {
    const kind = normalizarTipo(comp.tipo)

    // Las fuentes NO se colocan en un hueco: se vuelven batería al borde y
    // sus pines apuntan a los rieles (+ / −). Así todo lo que conecte a la
    // fuente se enruta al riel, que es como funciona físicamente.
    if (kind === 'source') {
      baterias.push({ id: comp.id, valor: comp.valor })
      comp.pines.forEach((p) => {
        const positivo = esPinPositivo(`${p.funcion} ${p.nombre}`)
        mapaPines.set(`${comp.id}.${p.nombre}`, positivo ? RAIL_PLUS : RAIL_MINUS)
      })
      return
    }

    const fila = FILAS[Math.floor(iGrid / COMPONENTES_POR_FILA) % FILAS.length]
    const col = COL_INICIAL + (iGrid % COMPONENTES_POR_FILA) * SEPARACION_COL
    iGrid++
    const a = holePos(fila, col)
    const b = holePos(fila, col + ANCHO_COMPONENTE)

    const props = comp.propiedades as Record<string, unknown> | null | undefined
    componentes.push({
      id: comp.id,
      kind,
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      label: `${comp.id} ${comp.valor}${comp.unidad ?? ''}`.trim(),
      valor: comp.valor,
      tolerancia: typeof props?.tolerancia === 'string' ? props.tolerancia.replace('%', '') : undefined,
      potenciaNominal: typeof props?.potencia_nominal === 'string' ? props.potencia_nominal : undefined,
    })

    if (comp.pines[0]) mapaPines.set(`${comp.id}.${comp.pines[0].nombre}`, a)
    if (comp.pines[1]) mapaPines.set(`${comp.id}.${comp.pines[1].nombre}`, b)
  })

  // Ubica cualquier extremo de conexión:
  //  1) pin de componente → su hueco
  //  2) nodo de poder (VCC/GND/+/−) → el riel correspondiente
  //  3) otro nodo con nombre (V_out...) → terminal etiquetada en la fila superior
  const mapaNodos = new Map<string, { x: number; y: number }>()
  const nodos: NodoPlano[] = []

  function ubicar(extremo: string): { x: number; y: number } {
    const pin = mapaPines.get(extremo)
    if (pin) return pin

    const riel = railDeNodo(extremo)
    if (riel) return riel

    const existente = mapaNodos.get(extremo)
    if (existente) return existente

    const col = COL_INICIAL + mapaNodos.size * SEPARACION_COL
    const pos = holePos(FILA_NODOS, col)
    mapaNodos.set(extremo, pos)
    nodos.push({ x: pos.x, y: pos.y, label: extremo, color: colorNodo(extremo) })
    return pos
  }

  const cables: CablePlano[] = netlist.conexiones.map((con) => {
    const desde = ubicar(con.de)
    const hasta = ubicar(con.a)
    return { x1: desde.x, y1: desde.y, x2: hasta.x, y2: hasta.y }
  })

  return { componentes, cables, nodos, baterias }
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
export function colorCable(nombre: string): string {
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

// `pasoActivo` habilita el REVELADO PROGRESIVO (issue #23): los pasos
// futuros no se dibujan, el paso activo se resalta y los previos se atenúan.
// Sin `pasoActivo` se dibuja todo en estado 'normal' (comportamiento clásico).
export function layoutDesdeInstrucciones(instrucciones: Instruccion[], pasoActivo?: number): {
  componentes: ComponentePlano[]
  cables: CablePlano[]
  baterias: BateriaPlano[]
} {
  const componentes: ComponentePlano[] = []
  const cables: CablePlano[] = []
  const baterias: BateriaPlano[] = []

  for (const ins of instrucciones) {
    // Revelado progresivo: lo que viene después del paso activo no existe aún.
    if (pasoActivo !== undefined && ins.numero > pasoActivo) continue
    const estado: EstadoItem =
      pasoActivo === undefined ? 'normal' : ins.numero === pasoActivo ? 'activo' : 'previo'

    if (ins.tipo === 'colocar_componente' && ins.pines && ins.pines.length >= 2) {
      const kind = normalizarTipo(ins.componente_tipo ?? '')
      // La fuente no se dibuja en el tablero: es batería al borde.
      if (kind === 'source') {
        baterias.push({ id: ins.componente_id ?? `F${ins.numero}`, valor: ins.componente_valor ?? undefined, estado })
        continue
      }
      const a = coordPlanner(ins.pines[0].fila, ins.pines[0].columna)
      const b = coordPlanner(ins.pines[1].fila, ins.pines[1].columna)
      // Componentes de 3 patas (transistor, potenciómetro, regulador...): la
      // 3ra pata es opcional en el JSON del planner — si no viene, el propio
      // componente la aproxima. Antes solo se leía para 'transistor', así que
      // potenciómetro/regulador perdían su coordenada del medio (issue: el
      // anillo de esa pata no aparecía).
      const c = ins.pines[2] ? coordPlanner(ins.pines[2].fila, ins.pines[2].columna) : null
      if (a && b) {
        componentes.push({
          id: ins.componente_id ?? `C${ins.numero}`,
          kind,
          estado,
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          x3: c?.x, y3: c?.y,
          label: `${ins.componente_id ?? ''} ${ins.componente_valor ?? ''}`.trim(),
          valor: ins.componente_valor ?? undefined,
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
      if (a && b) cables.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: colorCable(color), estado })
    }
  }

  return { componentes, cables, baterias }
}

// Instrucciones de ejemplo del planner (divisor) idénticas a las de la IA.
export const EJEMPLO_PLANNER: Instruccion[] = [
  { numero: 1, tipo: 'colocar_componente', componente_id: 'R1', componente_tipo: 'resistencia', componente_valor: '10k', descripcion: 'Coloca R1 en fila 1, columnas b y g.', pines: [{ nombre: 'pin1', fila: 1, columna: 'b' }, { nombre: 'pin2', fila: 1, columna: 'g' }], cable: null },
  { numero: 2, tipo: 'colocar_componente', componente_id: 'R2', componente_tipo: 'resistencia', componente_valor: '10k', descripcion: 'Coloca R2 en fila 3, columnas b y g.', pines: [{ nombre: 'pin1', fila: 3, columna: 'b' }, { nombre: 'pin2', fila: 3, columna: 'g' }], cable: null },
  { numero: 3, tipo: 'conectar_cable', componente_id: null, componente_tipo: null, componente_valor: null, descripcion: 'Cable amarillo de R1 (1,g) a R2 (3,b).', pines: null, cable: { color: 'amarillo', desde: { fila: 1, columna: 'g' }, hasta: { fila: 3, columna: 'b' } } },
  { numero: 4, tipo: 'conectar_cable', componente_id: null, componente_tipo: null, componente_valor: null, descripcion: 'Cable negro de R2 (3,g) al riel negativo.', pines: null, cable: { color: 'negro', desde: { fila: 3, columna: 'g' }, hasta: { fila: 0, columna: '-' } } },
]

// Instrucciones de ejemplo: diodo + transistor BJT (prueba de los
// componentes de 2 y 3 patas más recientes del catálogo).
export const EJEMPLO_DIODO_TRANSISTOR: Instruccion[] = [
  { numero: 1, tipo: 'colocar_componente', componente_id: 'D1', componente_tipo: 'diodo', componente_valor: '1N4007', descripcion: 'Coloca D1 en fila 2, columnas b y f.', pines: [{ nombre: 'anodo', fila: 2, columna: 'b' }, { nombre: 'catodo', fila: 2, columna: 'f' }], cable: null },
  { numero: 2, tipo: 'colocar_componente', componente_id: 'Q1', componente_tipo: 'transistor', componente_valor: '2N2222', descripcion: 'Coloca Q1 (NPN) en fila 5, con emisor en b, base en d y colector en f.', pines: [{ nombre: 'emisor', fila: 5, columna: 'b' }, { nombre: 'colector', fila: 5, columna: 'f' }, { nombre: 'base', fila: 5, columna: 'd' }], cable: null },
]

// ============================================================
//  EJEMPLO COMPLEJO: Sensor de luz nocturna (13 pasos).
//  LDR + R1 forman un divisor; cuando oscurece, el nodo sube y
//  Q1 (NPN) enciende el LED a través de R3 (limitadora).
//  Topología por regletas (mismas columnas comparten strip a-e / f-j):
//    riel + → LDR → [nodo] → R1 → riel −
//    [nodo] → base Q1 · emisor → riel − · colector → cátodo LED
//    ánodo LED → R3 → riel +
//  Colores según convención §7.B: rojo=+, negro=GND, otros=señal.
// ============================================================
export const EJEMPLO_SENSOR_LUZ: Instruccion[] = [
  { numero: 1, tipo: 'colocar_componente', componente_id: 'BAT1', componente_tipo: 'fuente', componente_valor: '9V', descripcion: 'Conecta la batería de 9V: el positivo al riel rojo (+) y el negativo al riel azul (−).', pines: [{ nombre: 'positivo', fila: 1, columna: '+' }, { nombre: 'negativo', fila: 1, columna: '-' }], cable: null },
  { numero: 2, tipo: 'colocar_componente', componente_id: 'LDR1', componente_tipo: 'fotorresistor', componente_valor: 'GL5528', descripcion: 'Coloca el fotorresistor (LDR) en la fila 3, entre las columnas b y f, cruzando el canal central.', pines: [{ nombre: 'pin1', fila: 3, columna: 'b' }, { nombre: 'pin2', fila: 3, columna: 'f' }], cable: null },
  { numero: 3, tipo: 'conectar_cable', componente_id: null, componente_tipo: null, componente_valor: null, descripcion: 'Cable rojo del riel + a la fila 3a (alimenta la pata superior del LDR por su regleta).', pines: null, cable: { color: 'rojo', desde: { fila: 3, columna: '+' }, hasta: { fila: 3, columna: 'a' } } },
  { numero: 4, tipo: 'colocar_componente', componente_id: 'R1', componente_tipo: 'resistencia', componente_valor: '10k', descripcion: 'Coloca R1 (10 kΩ) en la fila 6, entre b y f. Junto al LDR formará el divisor de voltaje.', pines: [{ nombre: 'pin1', fila: 6, columna: 'b' }, { nombre: 'pin2', fila: 6, columna: 'f' }], cable: null },
  { numero: 5, tipo: 'conectar_cable', componente_id: null, componente_tipo: null, componente_valor: null, descripcion: 'Cable amarillo de 3g a 6a: une la pata inferior del LDR con la superior de R1 — este es el NODO del divisor.', pines: null, cable: { color: 'amarillo', desde: { fila: 3, columna: 'g' }, hasta: { fila: 6, columna: 'a' } } },
  { numero: 6, tipo: 'conectar_cable', componente_id: null, componente_tipo: null, componente_valor: null, descripcion: 'Cable negro de 6g al riel −: cierra el divisor a tierra.', pines: null, cable: { color: 'negro', desde: { fila: 6, columna: 'g' }, hasta: { fila: 6, columna: '-' } } },
  { numero: 7, tipo: 'colocar_componente', componente_id: 'Q1', componente_tipo: 'transistor', componente_valor: '2N2222', descripcion: 'Coloca Q1 (NPN 2N2222) en la fila 10: emisor en b, base en d y colector en f.', pines: [{ nombre: 'emisor', fila: 10, columna: 'b' }, { nombre: 'colector', fila: 10, columna: 'f' }, { nombre: 'base', fila: 10, columna: 'd' }], cable: null },
  { numero: 8, tipo: 'conectar_cable', componente_id: null, componente_tipo: null, componente_valor: null, descripcion: 'Cable verde de 6c a 10e: lleva el nodo del divisor a la base de Q1 (la señal que decide si enciende).', pines: null, cable: { color: 'verde', desde: { fila: 6, columna: 'c' }, hasta: { fila: 10, columna: 'e' } } },
  { numero: 9, tipo: 'conectar_cable', componente_id: null, componente_tipo: null, componente_valor: null, descripcion: 'Cable negro de 10a al riel −: el emisor de Q1 va a tierra.', pines: null, cable: { color: 'negro', desde: { fila: 10, columna: 'a' }, hasta: { fila: 10, columna: '-' } } },
  { numero: 10, tipo: 'colocar_componente', componente_id: 'LED1', componente_tipo: 'led', componente_valor: 'rojo', descripcion: 'Coloca el LED en la fila 14: ánodo (pata larga) en b y cátodo (lado plano) en f.', pines: [{ nombre: 'anodo', fila: 14, columna: 'b' }, { nombre: 'catodo', fila: 14, columna: 'f' }], cable: null },
  { numero: 11, tipo: 'conectar_cable', componente_id: null, componente_tipo: null, componente_valor: null, descripcion: 'Cable azul de 10g a 14g: conecta el colector de Q1 con el cátodo del LED.', pines: null, cable: { color: 'azul', desde: { fila: 10, columna: 'g' }, hasta: { fila: 14, columna: 'g' } } },
  { numero: 12, tipo: 'colocar_componente', componente_id: 'R3', componente_tipo: 'resistencia', componente_valor: '220', descripcion: 'Coloca R3 (220 Ω, limitadora del LED) en la fila 18, entre b y f.', pines: [{ nombre: 'pin1', fila: 18, columna: 'b' }, { nombre: 'pin2', fila: 18, columna: 'f' }], cable: null },
  { numero: 13, tipo: 'conectar_cable', componente_id: null, componente_tipo: null, componente_valor: null, descripcion: 'Cable amarillo de 14a a 18a: une el ánodo del LED con R3.', pines: null, cable: { color: 'amarillo', desde: { fila: 14, columna: 'a' }, hasta: { fila: 18, columna: 'a' } } },
  { numero: 14, tipo: 'conectar_cable', componente_id: null, componente_tipo: null, componente_valor: null, descripcion: 'Cable rojo de 18g al riel +: R3 queda alimentada y el circuito completo. Tapa el LDR con la mano: ¡el LED enciende!', pines: null, cable: { color: 'rojo', desde: { fila: 18, columna: 'g' }, hasta: { fila: 18, columna: '+' } } },
]

// ============================================================
//  VITRINA de componentes (sin sentido eléctrico — es solo para QA
//  visual): un componente por fila, para revisar rápido cómo se ve
//  la miniatura recortada (MiniComponente) de cada tipo del catálogo
//  en la tarjeta "Componente(s)" del panel de la vista principal.
// ============================================================
const VITRINA_2_PATAS: [string, string, string][] = [
  ['R1', 'resistencia', '10k'],
  ['D1', 'diodo', '1N4007'],
  ['LED1', 'led', 'rojo'],
  ['C1', 'capacitor', '100nF'],
  ['C2', 'electrolitico', '100uF'],
  ['L1', 'inductor', '10mH'],
  ['F1', 'fusible', '1A'],
  ['SW1', 'interruptor', ''],
  ['SB1', 'pulsador', ''],
  ['LDR1', 'fotorresistor', 'GL5528'],
  ['BZ1', 'buzzer', ''],
  ['X1', 'cristal', '16MHz'],
  ['DS1', 'display 7 segmentos', ''],
  ['M1', 'motor', ''],
  ['LMP1', 'bombilla', ''],
]

export const EJEMPLO_VITRINA_COMPONENTES: Instruccion[] = [
  ...VITRINA_2_PATAS.map(([id, tipo, valor], i): Instruccion => ({
    numero: i + 1,
    tipo: 'colocar_componente',
    componente_id: id,
    componente_tipo: tipo,
    componente_valor: valor || null,
    descripcion: `Coloca ${id} en la fila ${i + 1}, entre b y f (solo para ver su miniatura).`,
    pines: [{ nombre: 'pin1', fila: i + 1, columna: 'b' }, { nombre: 'pin2', fila: i + 1, columna: 'f' }],
    cable: null,
  })),
  { numero: 16, tipo: 'colocar_componente', componente_id: 'Q1', componente_tipo: 'transistor', componente_valor: '2N2222', descripcion: 'Coloca Q1 en la fila 16 (solo para ver su miniatura).', pines: [{ nombre: 'emisor', fila: 16, columna: 'b' }, { nombre: 'colector', fila: 16, columna: 'f' }, { nombre: 'base', fila: 16, columna: 'd' }], cable: null },
  { numero: 17, tipo: 'colocar_componente', componente_id: 'P1', componente_tipo: 'potenciometro', componente_valor: '10k', descripcion: 'Coloca P1 en la fila 17 (solo para ver su miniatura).', pines: [{ nombre: 'pin1', fila: 17, columna: 'b' }, { nombre: 'pin2', fila: 17, columna: 'f' }, { nombre: 'wiper', fila: 17, columna: 'd' }], cable: null },
  { numero: 18, tipo: 'colocar_componente', componente_id: 'U1', componente_tipo: 'regulador 7805', componente_valor: '7805', descripcion: 'Coloca U1 en la fila 18 (solo para ver su miniatura).', pines: [{ nombre: 'vin', fila: 18, columna: 'b' }, { nombre: 'vout', fila: 18, columna: 'f' }, { nombre: 'gnd', fila: 18, columna: 'd' }], cable: null },
  { numero: 19, tipo: 'colocar_componente', componente_id: 'K1', componente_tipo: 'rele', componente_valor: null, descripcion: 'Coloca K1 en la fila 19 (solo para ver su miniatura).', pines: [{ nombre: 'pin1', fila: 19, columna: 'b' }, { nombre: 'pin2', fila: 19, columna: 'f' }], cable: null },
  { numero: 20, tipo: 'colocar_componente', componente_id: 'IC1', componente_tipo: 'circuito integrado', componente_valor: 'NE555', descripcion: 'Coloca IC1 en la fila 20 (solo para ver su miniatura).', pines: [{ nombre: 'pin1', fila: 20, columna: 'b' }, { nombre: 'pin8', fila: 20, columna: 'f' }], cable: null },
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

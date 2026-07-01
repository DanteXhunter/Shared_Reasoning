// ============================================================
//  Geometría de la protoboard — la "fuente de verdad" de coordenadas.
//  Tanto la protoboard como los componentes usan esto para saber
//  dónde está cada hueco. Cambiar un valor aquí reajusta TODO.
// ============================================================

export const SPACING = 22          // distancia entre huecos (px)
export const HOLE_R = 5            // radio de cada hueco
export const COLS = 30            // número de columnas
export const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] // filas
export const MARGIN_X = 50         // margen izquierdo (letras de fila)
export const MARGIN_Y = 84         // donde empieza la fila A (deja espacio a rieles + números)
export const GAP = SPACING * 1.5   // canal central que parte la protoboard

// --- Rieles de poder superiores ---
export const TOP_PLUS_Y = 24       // riel + (rojo) arriba
export const TOP_MINUS_Y = 44      // riel - (azul) arriba

// Posición Y de una fila por su índice (0 = A). Deja el canal central a partir de F.
export function rowY(index: number): number {
  const bankGap = index >= 5 ? GAP : 0
  return MARGIN_Y + index * SPACING + bankGap
}

// --- Rieles de poder inferiores (debajo de la última fila) ---
export function bottomPlusY(): number {
  return rowY(ROWS.length - 1) + SPACING * 1.4
}
export function bottomMinusY(): number {
  return bottomPlusY() + 20
}

// Traduce una coordenada de protoboard (ej. "A", 5) a píxeles {x, y}.
// Esto es lo que conecta el JSON del LLM con el dibujo de Konva.
export function holePos(row: string, col: number): { x: number; y: number } {
  const r = ROWS.indexOf(row)
  return {
    x: MARGIN_X + (col - 1) * SPACING, // col es 1-based, igual que las etiquetas
    y: rowY(r),
  }
}

// X de un hueco de riel para una columna dada (1-based).
export function railHoleX(col: number): number {
  return MARGIN_X + (col - 1) * SPACING
}

// Tamaño total del lienzo, derivado de los parámetros de arriba.
export function boardSize(): { width: number; height: number } {
  return {
    width: MARGIN_X * 2 + COLS * SPACING,
    height: bottomMinusY() + 30,
  }
}

// ============================================================
//  Traductor de coordenadas del JSON → píxeles.
//  El LLM/planner habla en coordenadas de protoboard (strings).
//  Esta es la ÚNICA función que el resto de la app usa para pasar
//  de "A5" (o un riel como "+9") al punto {x, y} donde dibujar.
//
//  Formatos aceptados:
//    "A5"  → hueco fila A, columna 5 (filas A-J, columnas 1..COLS)
//    "+9"  → riel positivo superior, columna 9
//    "-9"  → riel negativo superior, columna 9
//  Devuelve null si el string no es una coordenada reconocible.
// ============================================================
export function coordToXY(coord: string): { x: number; y: number } | null {
  const c = coord.trim().toUpperCase()

  const hueco = c.match(/^([A-J])(\d+)$/)
  if (hueco) {
    const [, fila, col] = hueco
    return holePos(fila, Number(col))
  }

  const riel = c.match(/^([+-])(\d+)$/)
  if (riel) {
    const [, signo, col] = riel
    return { x: railHoleX(Number(col)), y: signo === '+' ? TOP_PLUS_Y : TOP_MINUS_Y }
  }

  return null
}

// True si la coordenada apunta a un hueco de la grilla principal (no riel).
export function esHueco(coord: string): boolean {
  return /^[A-Ja-j]\d+$/.test(coord.trim())
}

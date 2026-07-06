// ============================================================
//  Código de colores de resistencias (estándar EIA), calculado
//  matemáticamente a partir del valor — no se "dibuja" cada
//  resistencia posible, se DERIVA de la carga (ej. "10k", "4k7").
// ============================================================

export type Banda = { hex: string; nombre: string }

// Colores 0-9 (dígitos Y multiplicador ×10^n comparten la misma paleta)
const DIGITO: Banda[] = [
  { hex: '#151515', nombre: 'negro' },
  { hex: '#7c4a1e', nombre: 'marrón' },
  { hex: '#dc2626', nombre: 'rojo' },
  { hex: '#f97316', nombre: 'naranja' },
  { hex: '#eab308', nombre: 'amarillo' },
  { hex: '#16a34a', nombre: 'verde' },
  { hex: '#2563eb', nombre: 'azul' },
  { hex: '#7c3aed', nombre: 'violeta' },
  { hex: '#9ca3af', nombre: 'gris' },
  { hex: '#f8fafc', nombre: 'blanco' },
]

const DORADO: Banda = { hex: '#d4af37', nombre: 'dorado' }
const PLATA: Banda = { hex: '#c0c0c0', nombre: 'plata' }

const TOLERANCIA: Record<string, Banda> = {
  '1': DIGITO[1], '2': DIGITO[2], '0.5': DIGITO[5], '0.25': DIGITO[6],
  '0.1': DIGITO[7], '0.05': DIGITO[8], '5': DORADO, '10': PLATA,
}

// ---- Parseo del valor: acepta "10k", "4.7k", "220", "1M" Y la notación
// de sustitución típica de esquemáticos a mano: "4k7" = 4.7kΩ, "2M2" =
// 2.2MΩ, "1R5" = 1.5Ω (la letra reemplaza el punto decimal). ----
export function parseOhmios(valorRaw: string): number {
  const s = valorRaw.trim()

  const sustitucion = s.match(/^(\d+)([kKMR])(\d+)?$/)
  if (sustitucion) {
    const [, entero, letra, decimales] = sustitucion
    const mult = letra.toLowerCase() === 'k' ? 1e3 : letra.toLowerCase() === 'm' ? 1e6 : 1
    const numero = decimales ? parseFloat(`${entero}.${decimales}`) : parseFloat(entero)
    return numero * mult
  }

  const estandar = s.match(/^([\d.]+)\s*([pnuµmkKMG]?)/)
  if (estandar) {
    const numero = parseFloat(estandar[1])
    const multiplicadores: Record<string, number> = {
      '': 1, k: 1e3, K: 1e3, M: 1e6, m: 1e-3, u: 1e-6, µ: 1e-6, n: 1e-9, p: 1e-12, G: 1e9,
    }
    return numero * (multiplicadores[estandar[2]] ?? 1)
  }

  return NaN
}

// Reduce un número a sus cifras significativas (2, o 3 si 2 no alcanzan
// para representarlo con exactitud) → así se decide 4 bandas vs 5 bandas.
function cifrasSignificativas(mantisa: number): number[] {
  let dosCifras = Math.round(mantisa * 10)
  if (dosCifras >= 100) dosCifras = 100 // corrige el borde 9.99→10.0
  if (Math.abs(dosCifras / 10 - mantisa) < 1e-6) {
    return dosCifras === 100 ? [1, 0] : [Math.floor(dosCifras / 10), dosCifras % 10]
  }
  const tresCifras = Math.round(mantisa * 100)
  return [Math.floor(tresCifras / 100), Math.floor(tresCifras / 10) % 10, tresCifras % 10]
}

export function calcularBandas(valorRaw: string, tolerancia = '5'): Banda[] {
  const ohmios = parseOhmios(valorRaw)
  if (!isFinite(ohmios) || ohmios <= 0) {
    // Valor no reconocible: banda "genérica" en vez de romper el render.
    return [DIGITO[8], DIGITO[8], DIGITO[8]]
  }

  let exponente = Math.floor(Math.log10(ohmios))
  let mantisa = ohmios / Math.pow(10, exponente)
  let digitos = cifrasSignificativas(mantisa)
  if (digitos.length === 2 && digitos[0] === 1 && digitos[1] === 0 && mantisa >= 9.99) {
    exponente += 1 // el redondeo de borde subió la mantisa a 10.0 → ajusta la potencia
  }

  const expMultiplicador = exponente - (digitos.length - 1)
  const bandaMultiplicador: Banda =
    expMultiplicador >= 0
      ? DIGITO[Math.min(expMultiplicador, 9)]
      : expMultiplicador === -1 ? DORADO : PLATA

  const bandasValor = digitos.map((d) => DIGITO[d])
  const bandaTolerancia = TOLERANCIA[tolerancia] ?? DORADO

  return [...bandasValor, bandaMultiplicador, bandaTolerancia]
}

// Tamaño físico relativo según potencia nominal (resistencias de más
// vatios son físicamente más grandes). Devuelve un factor de escala.
export function escalaPorPotencia(potenciaNominal?: string | null): number {
  const w = parseFloat(potenciaNominal ?? '0.25')
  if (!isFinite(w)) return 1
  if (w <= 0.125) return 0.8
  if (w <= 0.25) return 1
  if (w <= 0.5) return 1.25
  if (w <= 1) return 1.55
  return 1.9 // 2W o más
}

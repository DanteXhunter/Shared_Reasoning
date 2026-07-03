import { Group, Line, Rect } from 'react-konva'
import { calcularBandas, escalaPorPotencia } from '../resistorColorCode'

// Componente de LIBRERÍA: Resistor — con detalle "de producto":
// gradiente cilíndrico (simula volumen), sombra, brillo superior,
// y bandas de color CALCULADAS del valor real (no dibujadas a mano).
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
  valor?: string          // ej. "10k", "4k7", "220" — de aquí salen las bandas
  tolerancia?: string     // ej. "5" (%). Por defecto 5% (dorado).
  potenciaNominal?: string // ej. "0.25W" — de aquí sale el tamaño físico
}

function Resistor({ x1, y1, x2, y2, valor, tolerancia, potenciaNominal }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const length = Math.abs(x2 - x1)

  const escala = escalaPorPotencia(potenciaNominal)
  const bodyW = length * 0.55
  const bodyH = 14 * escala

  const bandas = calcularBandas(valor ?? '10k', tolerancia)
  // Las bandas de valor van agrupadas cerca de un extremo; la de
  // tolerancia queda separada — así se ve en una resistencia real.
  const nBandasValor = bandas.length - 1
  const anchoBanda = 3.2
  const separacion = bodyW / (nBandasValor + 2)

  return (
    <Group>
      {/* Patas */}
      <Line points={[x1, y1, midX - bodyW / 2, midY]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />
      <Line points={[midX + bodyW / 2, midY, x2, y2]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />

      {/* Cuerpo: gradiente cilíndrico + sombra (simula volumen, no un rectángulo plano) */}
      <Rect
        x={midX - bodyW / 2}
        y={midY - bodyH / 2}
        width={bodyW}
        height={bodyH}
        cornerRadius={bodyH / 2}
        fillLinearGradientStartPoint={{ x: 0, y: -bodyH / 2 }}
        fillLinearGradientEndPoint={{ x: 0, y: bodyH / 2 }}
        fillLinearGradientColorStops={[0, '#f0cd94', 0.5, '#d9ab68', 1, '#b98849']}
        stroke="#8a6229"
        strokeWidth={1}
        shadowColor="black"
        shadowBlur={5}
        shadowOpacity={0.35}
        shadowOffset={{ x: 0, y: 2 }}
        perfectDrawEnabled={false}
      />

      {/* Brillo superior (highlight de "volumen") */}
      <Rect
        x={midX - bodyW / 2 + 3}
        y={midY - bodyH / 2 + 1.5}
        width={bodyW - 6}
        height={2}
        cornerRadius={1}
        fill="rgba(255,255,255,0.35)"
        listening={false}
      />

      {/* Bandas de color: N de valor agrupadas + 1 de tolerancia separada */}
      {bandas.map((b, i) => {
        const esTolerancia = i === bandas.length - 1
        const posIndex = esTolerancia ? nBandasValor + 1 : i + 1
        const bx = midX - bodyW / 2 + posIndex * separacion
        return (
          <Rect
            key={i}
            x={bx - anchoBanda / 2}
            y={midY - bodyH / 2}
            width={anchoBanda}
            height={bodyH}
            fill={b.hex}
            listening={false}
          />
        )
      })}
    </Group>
  )
}

export default Resistor

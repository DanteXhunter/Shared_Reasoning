import { Group, Line, Rect } from 'react-konva'

// Componente de LIBRERÍA: Fusible (tubo de vidrio con filamento).
// Cuerpo translúcido con casquillos metálicos en los extremos y un
// hilo fino en medio (el que se funde ante sobrecorriente).
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
}

function Fuse({ x1, y1, x2, y2 }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const bodyW = Math.abs(x2 - x1) * 0.55
  const bodyH = 14
  const capW = 6

  return (
    <Group>
      {/* Patas */}
      <Line points={[x1, y1, midX - bodyW / 2, midY]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />
      <Line points={[midX + bodyW / 2, midY, x2, y2]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />

      {/* Tubo de vidrio (translúcido) */}
      <Rect
        x={midX - bodyW / 2}
        y={midY - bodyH / 2}
        width={bodyW}
        height={bodyH}
        cornerRadius={3}
        fill="rgba(200,220,235,0.35)"
        stroke="#94a3b8"
        strokeWidth={1}
        shadowColor="black"
        shadowBlur={4}
        shadowOpacity={0.25}
        shadowOffset={{ x: 0, y: 2 }}
        perfectDrawEnabled={false}
      />

      {/* Filamento interno (el hilo que se funde) */}
      <Line points={[midX - bodyW / 2 + capW, midY, midX + bodyW / 2 - capW, midY]} stroke="#6b7280" strokeWidth={1} perfectDrawEnabled={false} />

      {/* Casquillos metálicos en los extremos */}
      <Rect x={midX - bodyW / 2} y={midY - bodyH / 2} width={capW} height={bodyH} cornerRadius={2}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: bodyH }}
        fillLinearGradientColorStops={[0, '#e5e7eb', 0.5, '#9ca3af', 1, '#6b7280']} listening={false} />
      <Rect x={midX + bodyW / 2 - capW} y={midY - bodyH / 2} width={capW} height={bodyH} cornerRadius={2}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: bodyH }}
        fillLinearGradientColorStops={[0, '#e5e7eb', 0.5, '#9ca3af', 1, '#6b7280']} listening={false} />
    </Group>
  )
}

export default Fuse

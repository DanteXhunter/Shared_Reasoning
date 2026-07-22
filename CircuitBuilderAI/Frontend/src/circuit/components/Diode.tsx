import { Group, Line, Rect } from 'react-konva'

// Componente de LIBRERÍA: Diodo rectificador (ej. 1N4007).
// Cuerpo de "vidrio/plástico oscuro" + banda clara que marca el cátodo
// (por convención: x2 = cátodo, siguiendo el orden de pines del netlist).
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
}

function Diode({ x1, y1, x2, y2 }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const length = Math.abs(x2 - x1)
  const bodyW = length * 0.5
  const bodyH = 12

  return (
    <Group>
      {/* Patas */}
      <Line points={[x1, y1, midX - bodyW / 2, midY]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />
      <Line points={[midX + bodyW / 2, midY, x2, y2]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />

      {/* Cuerpo: gradiente oscuro tipo vidrio/epóxico */}
      <Rect
        x={midX - bodyW / 2}
        y={midY - bodyH / 2}
        width={bodyW}
        height={bodyH}
        cornerRadius={bodyH / 2}
        fillLinearGradientStartPoint={{ x: 0, y: -bodyH / 2 }}
        fillLinearGradientEndPoint={{ x: 0, y: bodyH / 2 }}
        fillLinearGradientColorStops={[0, '#3a3a3d', 0.5, '#1c1c1e', 1, '#0a0a0b']}
        stroke="#000"
        strokeWidth={1}
        shadowColor="black"
        shadowBlur={5}
        shadowOpacity={0.4}
        shadowOffset={{ x: 0, y: 2 }}
        perfectDrawEnabled={false}
      />

      {/* Brillo (vidrio) */}
      <Rect
        x={midX - bodyW / 2 + 3}
        y={midY - bodyH / 2 + 1.5}
        width={bodyW - 6}
        height={2}
        cornerRadius={1}
        fill="rgba(255,255,255,0.25)"
        listening={false}
      />

      {/* Banda del cátodo (extremo derecho = x2, por convención de orden de pines) */}
      <Rect
        x={midX + bodyW / 2 - 4}
        y={midY - bodyH / 2}
        width={2.5}
        height={bodyH}
        fill="#e5e7eb"
        listening={false}
      />
    </Group>
  )
}

export default Diode

import { Group, Line, Rect, Circle } from 'react-konva'

// Componente de LIBRERÍA: Botón pulsador (momentáneo).
// Distinto al interruptor: solo conecta MIENTRAS se presiona.
// Cuerpo cuadrado con botón redondo en el centro.
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
}

function PushButton({ x1, y1, x2, y2 }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const side = Math.min(Math.abs(x2 - x1) * 0.6, 26)

  return (
    <Group>
      {/* Patas */}
      <Line points={[x1, y1, midX - side / 2, midY]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />
      <Line points={[midX + side / 2, midY, x2, y2]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />

      {/* Base cuadrada */}
      <Rect
        x={midX - side / 2} y={midY - side / 2} width={side} height={side} cornerRadius={3}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: side }}
        fillLinearGradientColorStops={[0, '#4b5563', 0.5, '#374151', 1, '#1f2937']}
        stroke="#111827" strokeWidth={1}
        shadowColor="black" shadowBlur={5} shadowOpacity={0.4} shadowOffset={{ x: 0, y: 2 }}
        perfectDrawEnabled={false}
      />

      {/* Botón redondo central */}
      <Circle x={midX} y={midY} radius={side * 0.28}
        fillRadialGradientStartPoint={{ x: -2, y: -2 }} fillRadialGradientEndPoint={{ x: 0, y: 0 }}
        fillRadialGradientStartRadius={0} fillRadialGradientEndRadius={side * 0.32}
        fillRadialGradientColorStops={[0, '#f3f4f6', 1, '#9ca3af']}
        stroke="#6b7280" perfectDrawEnabled={false} />
    </Group>
  )
}

export default PushButton

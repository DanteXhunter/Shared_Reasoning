import { Group, Line, Rect, Text, Ellipse } from 'react-konva'

// Componente de LIBRERÍA: Cristal oscilador (encapsulado HC-49).
// Lata metálica ovalada-rectangular con reflejo cromado; 2 patas.
// No polarizado. Frecuencia impresa (ej. 16.000 MHz).
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
  freq?: string
}

function Crystal({ x1, y1, x2, y2, freq = '16 MHz' }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const w = 26
  const h = 16
  const bx = midX - w / 2
  const by = midY - h / 2

  return (
    <Group>
      {/* Patas (salen por abajo, juntas) */}
      <Line points={[midX - 6, by + h, midX - 6, by + h + 3, x1, y1]} stroke="#9ca3af" strokeWidth={2} lineCap="round" perfectDrawEnabled={false} />
      <Line points={[midX + 6, by + h, midX + 6, by + h + 3, x2, y2]} stroke="#9ca3af" strokeWidth={2} lineCap="round" perfectDrawEnabled={false} />

      {/* Lata metálica (cromada, gradiente vertical) */}
      <Rect
        x={bx} y={by} width={w} height={h} cornerRadius={h / 2}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: h }}
        fillLinearGradientColorStops={[0, '#f2f4f6', 0.35, '#c3c9d0', 0.55, '#e8ebee', 1, '#9aa1aa']}
        stroke="#7b828c" strokeWidth={1}
        shadowColor="black" shadowBlur={4} shadowOpacity={0.32} shadowOffset={{ x: 0, y: 2 }}
        perfectDrawEnabled={false}
      />
      {/* Reflejo cromado (banda de brillo horizontal) */}
      <Ellipse x={midX} y={by + 4} radiusX={w / 2 - 4} radiusY={2} fill="#ffffff" opacity={0.55} listening={false} />

      {/* Frecuencia impresa */}
      <Text x={bx} y={midY - 3} width={w} align="center" text={freq} fontSize={6.5} fontStyle="bold" fill="#3a3f47" listening={false} />
    </Group>
  )
}

export default Crystal

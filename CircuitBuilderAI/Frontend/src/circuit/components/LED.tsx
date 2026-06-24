import { Group, Line, Circle, Arc } from 'react-konva'

// Componente de LIBRERÍA: LED (diodo emisor de luz).
// Dos patas: el ánodo (x1) y el cátodo (x2, lado plano).
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
  color?: string // color del domo (rojo por defecto)
}

function LED({ x1, y1, x2, y2, color = '#ef4444' }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const domeR = 9

  return (
    <Group>
      {/* Patas */}
      <Line points={[x1, y1, midX - domeR, midY]} stroke="#9ca3af" strokeWidth={2} />
      <Line points={[midX + domeR, midY, x2, y2]} stroke="#9ca3af" strokeWidth={2} />

      {/* Domo del LED (semicírculo + base plana del lado del cátodo) */}
      <Arc x={midX} y={midY} innerRadius={0} outerRadius={domeR} angle={180} rotation={-90} fill={color} stroke="#7f1d1d" />
      <Circle x={midX} y={midY} radius={domeR} fill={color} opacity={0.55} stroke="#7f1d1d" />
    </Group>
  )
}

export default LED

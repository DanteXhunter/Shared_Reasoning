import { Group, Line, Circle, Text } from 'react-konva'

// Componente de LIBRERÍA: Capacitor cerámico (no polarizado).
// Dos patas; cuerpo en forma de disco entre ellas.
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
}

function Capacitor({ x1, y1, x2, y2 }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const bodyR = 11

  return (
    <Group>
      {/* Patas */}
      <Line points={[x1, y1, midX - bodyR, midY]} stroke="#9ca3af" strokeWidth={2} />
      <Line points={[midX + bodyR, midY, x2, y2]} stroke="#9ca3af" strokeWidth={2} />

      {/* Disco del capacitor (naranja/ámbar) */}
      <Circle x={midX} y={midY} radius={bodyR} fill="#f59e0b" stroke="#b45309" />
      <Text x={midX - 7} y={midY - 5} text="104" fontSize={8} fill="#78350f" />
    </Group>
  )
}

export default Capacitor

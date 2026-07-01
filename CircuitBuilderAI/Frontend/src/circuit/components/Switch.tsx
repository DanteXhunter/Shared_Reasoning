import { Group, Line, Circle } from 'react-konva'

// Componente de LIBRERÍA: interruptor (switch).
// Dos terminales + una palanca dibujada "abierta" (levantada).
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
}

function Switch({ x1, y1, x2, y2 }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  // Terminales del interruptor (un poco hacia adentro de cada pata)
  const t1x = midX - 9
  const t2x = midX + 9

  return (
    <Group>
      {/* Patas */}
      <Line points={[x1, y1, t1x, midY]} stroke="#9ca3af" strokeWidth={2} />
      <Line points={[t2x, midY, x2, y2]} stroke="#9ca3af" strokeWidth={2} />

      {/* Palanca abierta: sube desde el terminal 1 sin tocar el 2 */}
      <Line points={[t1x, midY, t2x - 2, midY - 12]} stroke="#334155" strokeWidth={2} lineCap="round" />

      {/* Terminales */}
      <Circle x={t1x} y={midY} radius={3} fill="#334155" />
      <Circle x={t2x} y={midY} radius={3} fill="#334155" />
    </Group>
  )
}

export default Switch

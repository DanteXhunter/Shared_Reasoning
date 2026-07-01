import { Group, Line, Rect } from 'react-konva'

// Componente de LIBRERÍA: genérico (caja).
// Se usa para tipos que todavía no tienen un dibujo propio
// (fuente de voltaje, batería, circuitos integrados, etc.).
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
}

function Generic({ x1, y1, x2, y2 }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const w = Math.abs(x2 - x1) * 0.6
  const h = 16

  return (
    <Group>
      <Line points={[x1, y1, midX - w / 2, midY]} stroke="#9ca3af" strokeWidth={2} />
      <Line points={[midX + w / 2, midY, x2, y2]} stroke="#9ca3af" strokeWidth={2} />
      <Rect x={midX - w / 2} y={midY - h / 2} width={w} height={h} cornerRadius={3} fill="#94a3b8" stroke="#475569" />
    </Group>
  )
}

export default Generic

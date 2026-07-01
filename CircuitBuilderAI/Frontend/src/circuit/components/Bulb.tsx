import { Group, Line, Circle } from 'react-konva'

// Componente de LIBRERÍA: bombilla / lámpara / carga (símbolo de lámpara).
// Círculo con una X interna, entre dos patas.
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
}

function Bulb({ x1, y1, x2, y2 }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const r = 11
  const d = r * 0.7 // desplazamiento de la X (en diagonal)

  return (
    <Group>
      {/* Patas */}
      <Line points={[x1, y1, midX - r, midY]} stroke="#9ca3af" strokeWidth={2} />
      <Line points={[midX + r, midY, x2, y2]} stroke="#9ca3af" strokeWidth={2} />

      {/* Cuerpo de la lámpara */}
      <Circle x={midX} y={midY} radius={r} fill="#fde68a" stroke="#ca8a04" />
      {/* La X interna (filamento) */}
      <Line points={[midX - d, midY - d, midX + d, midY + d]} stroke="#ca8a04" strokeWidth={1.5} />
      <Line points={[midX - d, midY + d, midX + d, midY - d]} stroke="#ca8a04" strokeWidth={1.5} />
    </Group>
  )
}

export default Bulb

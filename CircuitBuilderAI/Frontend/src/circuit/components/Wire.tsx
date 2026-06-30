import { Group, Line, Circle } from 'react-konva'

// Componente de LIBRERÍA: Cable / jumper.
// Conecta dos huecos con un cable de color (con leve curva).
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
  color?: string // color del cable (rojo por defecto)
}

function Wire({ x1, y1, x2, y2, color = '#dc2626' }: Props) {
  // Punto de control para una curva suave (sube un poco en el medio)
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2 - 18

  return (
    <Group>
      <Line
        points={[x1, y1, midX, midY, x2, y2]}
        stroke={color}
        strokeWidth={3}
        lineCap="round"
        tension={0.5} // curva suave en lugar de líneas rectas
      />
      {/* Tapas en las puntas (donde entra al hueco) */}
      <Circle x={x1} y={y1} radius={3} fill={color} />
      <Circle x={x2} y={y2} radius={3} fill={color} />
    </Group>
  )
}

export default Wire

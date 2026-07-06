import { Group, Line, Rect, Text } from 'react-konva'

// Componente de LIBRERÍA: Fuente = batería FÍSICA (pila real), no el
// símbolo esquemático. Cuerpo cilíndrico con envoltura de color, terminal
// + saliente, y cables (rojo +, negro −) hacia los huecos.
// (En una protoboard la energía llega por los rieles; este dibujo es la
//  pila física con sus cables — ver nota de layout en el CLAUDE.md.)
type Props = {
  x1: number // terminal negativo (−)
  y1: number
  x2: number // terminal positivo (+)
  y2: number
  valor?: string // ej. "9V"
}

function Source({ x1, y1, x2, y2, valor }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const bodyW = Math.abs(x2 - x1) * 0.5
  const bodyH = 24
  const left = midX - bodyW / 2
  const right = midX + bodyW / 2

  return (
    <Group>
      {/* Cables: negro (−) a la izquierda, rojo (+) a la derecha */}
      <Line points={[x1, y1, left, midY]} stroke="#1f2937" strokeWidth={2.5} lineCap="round" perfectDrawEnabled={false} />
      <Line points={[right + 4, midY, x2, y2]} stroke="#dc2626" strokeWidth={2.5} lineCap="round" perfectDrawEnabled={false} />

      {/* Cuerpo de la pila (metálico, con gradiente y sombra) */}
      <Rect
        x={left} y={midY - bodyH / 2} width={bodyW} height={bodyH} cornerRadius={4}
        fillLinearGradientStartPoint={{ x: 0, y: -bodyH / 2 }} fillLinearGradientEndPoint={{ x: 0, y: bodyH / 2 }}
        fillLinearGradientColorStops={[0, '#5b6472', 0.5, '#2f3742', 1, '#1a1f28']}
        stroke="#12161c" strokeWidth={1}
        shadowColor="black" shadowBlur={6} shadowOpacity={0.4} shadowOffset={{ x: 0, y: 3 }}
        perfectDrawEnabled={false}
      />

      {/* Envoltura de color (etiqueta de la pila) */}
      <Rect x={left + bodyW * 0.18} y={midY - bodyH / 2} width={bodyW * 0.64} height={bodyH}
        fillLinearGradientStartPoint={{ x: 0, y: -bodyH / 2 }} fillLinearGradientEndPoint={{ x: 0, y: bodyH / 2 }}
        fillLinearGradientColorStops={[0, '#f59e0b', 0.5, '#d97706', 1, '#b45309']}
        listening={false} />
      {valor && <Text x={left + bodyW * 0.2} y={midY - 5} text={valor} fontSize={9} fill="#fff" fontStyle="bold" listening={false} />}

      {/* Terminal + saliente (nub metálico) en el extremo derecho */}
      <Rect x={right} y={midY - 4} width={4} height={8} cornerRadius={1}
        fillLinearGradientStartPoint={{ x: 0, y: -4 }} fillLinearGradientEndPoint={{ x: 0, y: 4 }}
        fillLinearGradientColorStops={[0, '#e5e7eb', 1, '#9ca3af']} listening={false} />

      {/* Brillo superior (reflejo metálico) */}
      <Rect x={left + 3} y={midY - bodyH / 2 + 2} width={bodyW - 6} height={2} cornerRadius={1} fill="rgba(255,255,255,0.3)" listening={false} />

      {/* Signos de polaridad */}
      <Text x={right - 10} y={midY - bodyH / 2 - 12} text="+" fontSize={11} fill="#dc2626" fontStyle="bold" listening={false} />
      <Text x={left + 2} y={midY - bodyH / 2 - 12} text="−" fontSize={11} fill="#374151" fontStyle="bold" listening={false} />
    </Group>
  )
}

export default Source

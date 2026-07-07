import { Group, Line, Rect, Circle, Ellipse, Text } from 'react-konva'

// Componente de LIBRERÍA: Motor DC (lata cilíndrica tipo "hobby").
// Vista lateral: cuerpo metálico + tapa con eje. 2 terminales.
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
}

function Motor({ x1, y1, x2, y2 }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const w = 34
  const h = 22
  const bx = midX - w / 2
  const by = midY - h / 2

  return (
    <Group>
      {/* Terminales (dos leads cortos hacia los huecos) */}
      <Line points={[bx + 6, by + h, bx + 6, by + h + 4, x1, y1]} stroke="#dc2626" strokeWidth={2} lineCap="round" perfectDrawEnabled={false} />
      <Line points={[bx + w - 6, by + h, bx + w - 6, by + h + 4, x2, y2]} stroke="#1f2937" strokeWidth={2} lineCap="round" perfectDrawEnabled={false} />

      {/* Cuerpo cilíndrico metálico (gradiente vertical = curvatura) */}
      <Rect
        x={bx} y={by} width={w} height={h} cornerRadius={5}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: h }}
        fillLinearGradientColorStops={[0, '#e9edf1', 0.3, '#aab1ba', 0.55, '#d8dde2', 1, '#868d97']}
        stroke="#6b7280" strokeWidth={1}
        shadowColor="black" shadowBlur={5} shadowOpacity={0.35} shadowOffset={{ x: 0, y: 2 }}
        perfectDrawEnabled={false}
      />
      {/* Costuras del cilindro (crimps de la lata) */}
      <Line points={[bx + 5, by, bx + 5, by + h]} stroke="#7b828c" strokeWidth={0.8} listening={false} />
      <Line points={[bx + w - 5, by, bx + w - 5, by + h]} stroke="#7b828c" strokeWidth={0.8} listening={false} />

      {/* Tapa frontal + eje saliente (lado derecho) */}
      <Ellipse x={bx + w} y={midY} radiusX={3.5} radiusY={h / 2} fill="#b8bec7" stroke="#6b7280" strokeWidth={0.8} listening={false} />
      <Rect x={bx + w + 2} y={midY - 1.5} width={7} height={3} cornerRadius={1.5} fill="#5b616b" listening={false} />
      <Circle x={bx + w + 9} y={midY} radius={1.6} fill="#3a3f47" listening={false} />

      {/* Símbolo M */}
      <Text x={bx} y={midY - 5} width={w} align="center" text="M" fontSize={11} fontStyle="bold" fill="#4b5563" listening={false} />
    </Group>
  )
}

export default Motor

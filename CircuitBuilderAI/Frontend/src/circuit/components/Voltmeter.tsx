import { Group, Line, Circle, Text } from 'react-konva'

// Componente de LIBRERÍA: Voltímetro (instrumento de medición, no polarizado
// en el sentido de un LED — pero sus dos puntas SÍ importan: roja = + / negra = −,
// igual que en un multímetro real).
// Carátula circular blanca con aguja/"V" central y dos puntas de prueba.
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
}

function Voltmeter({ x1, y1, x2, y2 }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const r = 15

  return (
    <Group>
      {/* Puntas de prueba (salen por abajo) */}
      <Line points={[midX - 6, midY + r - 4, midX - 6, midY + r + 2, x1, y1]} stroke="#dc2626" strokeWidth={2} lineCap="round" perfectDrawEnabled={false} />
      <Line points={[midX + 6, midY + r - 4, midX + 6, midY + r + 2, x2, y2]} stroke="#1f2937" strokeWidth={2} lineCap="round" perfectDrawEnabled={false} />

      {/* Cuerpo del instrumento (carátula circular) */}
      <Circle x={midX} y={midY + 2} radius={r} fill="#c7cad1" listening={false} perfectDrawEnabled={false} />
      <Circle
        x={midX} y={midY} radius={r}
        fillRadialGradientStartPoint={{ x: -r * 0.4, y: -r * 0.4 }}
        fillRadialGradientEndPoint={{ x: 0, y: 0 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndRadius={r * 1.2}
        fillRadialGradientColorStops={[0, '#ffffff', 0.6, '#f1f2f4', 1, '#d7d9dd']}
        stroke="#4b5058" strokeWidth={1.2}
        shadowColor="black" shadowBlur={5} shadowOpacity={0.35} shadowOffset={{ x: 0, y: 2 }}
        perfectDrawEnabled={false}
      />

      {/* Anillo interior de la carátula */}
      <Circle x={midX} y={midY} radius={r - 3.5} stroke="#9ca3af" strokeWidth={0.8} listening={false} />

      {/* "V" central */}
      <Text
        x={midX - 5} y={midY - 6}
        text="V" fontSize={13} fontStyle="bold" fill="#1f2937"
        listening={false}
      />

      {/* Marcas de polaridad en los bornes */}
      <Text x={midX - r + 1} y={midY + r - 8} text="+" fontSize={8} fontStyle="bold" fill="#dc2626" listening={false} />
      <Text x={midX + r - 8} y={midY + r - 8} text="−" fontSize={8} fontStyle="bold" fill="#1f2937" listening={false} />
    </Group>
  )
}

export default Voltmeter

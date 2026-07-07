import { Group, Line, Circle, Shape, Ellipse } from 'react-konva'

// Componente de LIBRERÍA: Fotorresistor / LDR (GL5528).
// Disco cerámico claro con la pista SERPENTEANTE de sulfuro de cadmio
// (el zig-zag característico). No polarizado. Es el sensor del circuito
// "Sensor de luz LDR" de referencia del proyecto.
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
}

function Photoresistor({ x1, y1, x2, y2 }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const r = 11

  // Pista serpenteante dentro del disco (meandro horizontal).
  const meander: number[] = []
  const cols = 6
  const span = r * 1.3
  const top = midY - r * 0.62
  const bot = midY + r * 0.62
  for (let i = 0; i <= cols; i++) {
    const mx = midX - span / 2 + (span / cols) * i
    meander.push(mx, i % 2 === 0 ? top : bot)
  }

  return (
    <Group>
      {/* Patas (salen juntas por abajo, como el LDR real) */}
      <Line points={[midX - 5, midY + r - 2, midX - 5, midY + r + 2, x1, y1]} stroke="#9ca3af" strokeWidth={2} lineCap="round" perfectDrawEnabled={false} />
      <Line points={[midX + 5, midY + r - 2, midX + 5, midY + r + 2, x2, y2]} stroke="#9ca3af" strokeWidth={2} lineCap="round" perfectDrawEnabled={false} />

      {/* Disco cerámico (cara sensora, beige claro con volumen) */}
      <Circle
        x={midX} y={midY} radius={r}
        fillRadialGradientStartPoint={{ x: -3, y: -3 }}
        fillRadialGradientEndPoint={{ x: 0, y: 0 }}
        fillRadialGradientStartRadius={1}
        fillRadialGradientEndRadius={r * 1.1}
        fillRadialGradientColorStops={[0, '#fbf6e4', 0.6, '#e9dfc2', 1, '#c9bd98']}
        stroke="#9a8f6c" strokeWidth={1}
        shadowColor="black" shadowBlur={4} shadowOpacity={0.3} shadowOffset={{ x: 0, y: 2 }}
        perfectDrawEnabled={false}
      />

      {/* Pista serpenteante de CdS (el zig-zag) */}
      <Line points={meander} stroke="#5b3b17" strokeWidth={2} lineCap="round" lineJoin="round" tension={0.15} listening={false} perfectDrawEnabled={false} />
      {/* Electrodos en los extremos de la pista */}
      <Shape
        sceneFunc={(ctx, shape) => {
          ctx.beginPath()
          ctx.rect(midX - span / 2 - 2, top - 2, 3, (bot - top) + 4)
          ctx.rect(midX + span / 2 - 1, top - 2, 3, (bot - top) + 4)
          ctx.fillShape(shape)
        }}
        fill="#8a6a2f" listening={false}
      />

      {/* Brillo especular del recubrimiento */}
      <Ellipse x={midX - 3.5} y={midY - 4} radiusX={3} radiusY={4} fill="#ffffff" opacity={0.4} listening={false} />
    </Group>
  )
}

export default Photoresistor

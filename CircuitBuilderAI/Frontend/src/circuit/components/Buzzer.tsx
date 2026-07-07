import { Group, Line, Circle, Text, Arc } from 'react-konva'

// Componente de LIBRERÍA: Buzzer / zumbador piezoeléctrico activo.
// Cilindro negro con orificio de sonido arriba y marca de polaridad (+).
// Polarizado: pin + (x1, pata larga) · pin − (x2).
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
}

function Buzzer({ x1, y1, x2, y2 }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const r = 13

  return (
    <Group>
      {/* Patas (salen por abajo) */}
      <Line points={[midX - 5, midY + r - 3, midX - 5, midY + r + 2, x1, y1]} stroke="#b8bcc4" strokeWidth={2} lineCap="round" perfectDrawEnabled={false} />
      <Line points={[midX + 5, midY + r - 3, midX + 5, midY + r + 2, x2, y2]} stroke="#9ca3af" strokeWidth={2} lineCap="round" perfectDrawEnabled={false} />

      {/* Falda inferior del cilindro (da grosor) */}
      <Circle x={midX} y={midY + 2} radius={r} fill="#0d0f12" listening={false} perfectDrawEnabled={false} />

      {/* Cara superior del cilindro (plástico negro con volumen) */}
      <Circle
        x={midX} y={midY} radius={r}
        fillRadialGradientStartPoint={{ x: -r * 0.4, y: -r * 0.4 }}
        fillRadialGradientEndPoint={{ x: 0, y: 0 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndRadius={r * 1.2}
        fillRadialGradientColorStops={[0, '#4b5058', 0.55, '#23262b', 1, '#111316']}
        stroke="#050608" strokeWidth={1}
        shadowColor="black" shadowBlur={5} shadowOpacity={0.4} shadowOffset={{ x: 0, y: 2 }}
        perfectDrawEnabled={false}
      />

      {/* Orificio de sonido central */}
      <Circle x={midX} y={midY} radius={2.6} fill="#000000" stroke="#3a3f47" strokeWidth={0.8} listening={false} />
      {/* Ondas de sonido (detalle sugerido alrededor del orificio) */}
      <Arc x={midX} y={midY} innerRadius={4.5} outerRadius={4.5} angle={120} rotation={-60} stroke="#5b616b" strokeWidth={0.8} listening={false} />
      <Arc x={midX} y={midY} innerRadius={7} outerRadius={7} angle={120} rotation={-60} stroke="#464b54" strokeWidth={0.8} listening={false} />

      {/* Marca de polaridad + */}
      <Text x={midX - r + 2} y={midY - r + 1} text="+" fontSize={9} fontStyle="bold" fill="#e5e7eb" listening={false} />
    </Group>
  )
}

export default Buzzer

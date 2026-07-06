import { Group, Line, Rect } from 'react-konva'

// Componente de LIBRERÍA: Interruptor deslizable (slide switch) FÍSICO,
// no el símbolo esquemático de la palanca. Cuerpo con carcasa + perilla
// deslizante arriba y pines metálicos hacia los huecos.
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
}

function Switch({ x1, y1, x2, y2 }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const bodyW = Math.min(Math.abs(x2 - x1) * 0.55, 34)
  const bodyH = 20
  const bodyY = midY - bodyH / 2

  return (
    <Group>
      {/* Pines a los huecos */}
      <Line points={[x1, y1, midX - bodyW / 2 + 4, bodyY + bodyH]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />
      <Line points={[x2, y2, midX + bodyW / 2 - 4, bodyY + bodyH]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />

      {/* Carcasa del switch (plástico, gradiente + sombra) */}
      <Rect
        x={midX - bodyW / 2} y={bodyY} width={bodyW} height={bodyH} cornerRadius={3}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: bodyH }}
        fillLinearGradientColorStops={[0, '#5b6472', 0.5, '#374151', 1, '#1f2937']}
        stroke="#111827" strokeWidth={1}
        shadowColor="black" shadowBlur={5} shadowOpacity={0.4} shadowOffset={{ x: 0, y: 2 }}
        perfectDrawEnabled={false}
      />

      {/* Riel/canal donde corre la perilla */}
      <Rect x={midX - bodyW / 2 + 4} y={bodyY + 4} width={bodyW - 8} height={6} cornerRadius={3} fill="#0f172a" listening={false} />

      {/* Perilla deslizante (posicionada a un lado = estado) */}
      <Rect x={midX - bodyW / 2 + 5} y={bodyY + 2} width={bodyW * 0.3} height={10} cornerRadius={2}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: 10 }}
        fillLinearGradientColorStops={[0, '#f3f4f6', 1, '#9ca3af']}
        stroke="#6b7280" listening={false} />
    </Group>
  )
}

export default Switch

import { Group, Line, Circle, Rect, Shape } from 'react-konva'

// Componente de LIBRERÍA: Bombilla incandescente FÍSICA (globo de vidrio +
// filamento + base metálica), no el símbolo esquemático de círculo con X.
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
}

function Bulb({ x1, y1, x2, y2 }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const r = 12
  const globoY = midY - 6 // el globo va un poco arriba; la base abajo

  return (
    <Group>
      {/* Patas a los huecos */}
      <Line points={[x1, y1, midX - 5, midY + 8]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />
      <Line points={[midX + 5, midY + 8, x2, y2]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />

      {/* Base metálica roscada (casquillo) */}
      <Rect x={midX - 6} y={globoY + r - 2} width={12} height={9} cornerRadius={1}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: 9 }}
        fillLinearGradientColorStops={[0, '#d1d5db', 0.5, '#9ca3af', 1, '#6b7280']}
        stroke="#4b5563" listening={false} />
      {/* Roscas de la base */}
      <Line points={[midX - 6, globoY + r + 1, midX + 6, globoY + r + 1]} stroke="#6b7280" strokeWidth={0.7} listening={false} />
      <Line points={[midX - 6, globoY + r + 4, midX + 6, globoY + r + 4]} stroke="#6b7280" strokeWidth={0.7} listening={false} />

      {/* Globo de vidrio (radial gradient translúcido con brillo) */}
      <Circle
        x={midX} y={globoY} radius={r}
        fillRadialGradientStartPoint={{ x: -3, y: -3 }} fillRadialGradientEndPoint={{ x: 0, y: 0 }}
        fillRadialGradientStartRadius={0} fillRadialGradientEndRadius={r + 3}
        fillRadialGradientColorStops={[0, '#fffbeb', 0.6, '#fde68a', 1, '#facc15']}
        stroke="#ca8a04" strokeWidth={1}
        shadowColor="#fde047" shadowBlur={8} shadowOpacity={0.5}
        perfectDrawEnabled={false}
      />

      {/* Filamento interno (zig-zag) */}
      <Shape
        sceneFunc={(ctx, shape) => {
          ctx.beginPath()
          ctx.moveTo(midX - 4, globoY + 3)
          ctx.lineTo(midX - 2, globoY - 3)
          ctx.lineTo(midX, globoY + 3)
          ctx.lineTo(midX + 2, globoY - 3)
          ctx.lineTo(midX + 4, globoY + 3)
          ctx.strokeShape(shape)
        }}
        stroke="#b45309" strokeWidth={1} listening={false}
      />

      {/* Brillo especular del vidrio */}
      <Circle x={midX - 4} y={globoY - 4} radius={2.5} fill="rgba(255,255,255,0.7)" listening={false} />
    </Group>
  )
}

export default Bulb

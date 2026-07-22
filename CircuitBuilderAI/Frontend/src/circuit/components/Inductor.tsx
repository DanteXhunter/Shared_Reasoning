import { Group, Line, Shape } from 'react-konva'

// Componente de LIBRERÍA: Inductor / bobina.
// Serie de espiras (arcos) que simulan el alambre enrollado.
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
  espiras?: number
}

function Inductor({ x1, y1, x2, y2, espiras = 4 }: Props) {
  const midY = (y1 + y2) / 2
  const length = Math.abs(x2 - x1)
  const coilW = length * 0.6
  const startX = (x1 + x2) / 2 - coilW / 2
  const r = coilW / (espiras * 2)

  return (
    <Group>
      {/* Patas */}
      <Line points={[x1, y1, startX, midY]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />
      <Line points={[startX + coilW, midY, x2, y2]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />

      {/* Espiras: arcos semicirculares consecutivos (efecto de bobina) */}
      <Shape
        sceneFunc={(ctx, shape) => {
          ctx.beginPath()
          for (let i = 0; i < espiras; i++) {
            const cx = startX + r + i * 2 * r
            ctx.arc(cx, midY, r, Math.PI, 0, false)
          }
          ctx.strokeShape(shape)
        }}
        stroke="#b45309"
        strokeWidth={3}
        lineCap="round"
        shadowColor="black"
        shadowBlur={3}
        shadowOpacity={0.3}
        shadowOffset={{ x: 0, y: 2 }}
        perfectDrawEnabled={false}
      />
    </Group>
  )
}

export default Inductor

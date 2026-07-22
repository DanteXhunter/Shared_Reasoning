import { Group, Line, Shape, Text, Ellipse } from 'react-konva'

// Componente de LIBRERÍA: Capacitor cerámico de disco (no polarizado).
// Cuerpo con forma de "gota/paleta" azul-ámbar con volumen (gradiente + brillo),
// patas que se juntan hacia abajo como en el componente real. No polarizado:
// da igual la orientación de x1/x2.
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
  valor?: string // código impreso, ej. "104" = 100nF
}

function Capacitor({ x1, y1, x2, y2, valor }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const w = 20 // ancho de la paleta
  const h = 22 // alto
  const topY = midY - h + 4
  // Las patas de un cerámico salen JUNTAS por abajo (no por los lados).
  const legGap = 5

  return (
    <Group>
      {/* Patas: bajan desde el cuerpo, con un pequeño doblez hacia cada hueco */}
      <Line points={[midX - legGap, midY, midX - legGap, midY + 3, x1, y1]} stroke="#9ca3af" strokeWidth={2} lineCap="round" perfectDrawEnabled={false} />
      <Line points={[midX + legGap, midY, midX + legGap, midY + 3, x2, y2]} stroke="#9ca3af" strokeWidth={2} lineCap="round" perfectDrawEnabled={false} />

      {/* Cuerpo tipo paleta/gota: base ancha redondeada, top achatado */}
      <Shape
        sceneFunc={(ctx, shape) => {
          ctx.beginPath()
          ctx.moveTo(midX - w / 2, midY - 2)
          ctx.quadraticCurveTo(midX - w / 2 - 2, topY + 4, midX - w / 2 + 4, topY)
          ctx.quadraticCurveTo(midX, topY - 4, midX + w / 2 - 4, topY)
          ctx.quadraticCurveTo(midX + w / 2 + 2, topY + 4, midX + w / 2, midY - 2)
          ctx.quadraticCurveTo(midX, midY + 4, midX - w / 2, midY - 2)
          ctx.closePath()
          ctx.fillStrokeShape(shape)
        }}
        fillRadialGradientStartPoint={{ x: midX - 4, y: topY + 6 }}
        fillRadialGradientEndPoint={{ x: midX, y: midY - 6 }}
        fillRadialGradientStartRadius={2}
        fillRadialGradientEndRadius={16}
        fillRadialGradientColorStops={[0, '#7ba7d0', 0.5, '#4a7fb5', 1, '#2f5c8a']}
        stroke="#274a6e" strokeWidth={0.8}
        shadowColor="black" shadowBlur={4} shadowOpacity={0.3} shadowOffset={{ x: 0, y: 2 }}
        perfectDrawEnabled={false}
      />

      {/* Brillo especular */}
      <Ellipse x={midX - 4} y={topY + 7} radiusX={4} radiusY={5} fill="#ffffff" opacity={0.4} listening={false} />

      {/* Código impreso (ej. 104) */}
      <Text x={midX - w / 2} y={midY - h / 2 - 2} width={w} align="center" text={valor ?? '104'} fontSize={7} fontStyle="bold" fill="#e8f0f8" listening={false} />
    </Group>
  )
}

export default Capacitor

import { Group, Line, Rect, Shape, Text } from 'react-konva'

// Componente de LIBRERÍA: Transistor BJT, paquete TO-92 (el más común
// en protoboard). A diferencia de los componentes de 2 patas, este
// introduce el patrón de "3 patas en abanico desde un cuerpo compacto":
// reutilizable después para MOSFETs, reguladores de voltaje, etc.
//
// x1,y1 / x2,y2 = patas izquierda/derecha (como los demás componentes).
// x3,y3 = pata central (base); si no se da, se calcula el punto medio.
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
  x3?: number
  y3?: number
}

function Transistor({ x1, y1, x2, y2, x3, y3 }: Props) {
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2
  const midX = x3 ?? cx
  const midY = y3 ?? cy - Math.abs(x2 - x1) * 0.15 // si no hay 3ra pata real, la "sube" un poco

  const cuerpoR = Math.abs(x2 - x1) * 0.22
  const cuerpoY = Math.min(y1, y2, midY) - cuerpoR * 1.4 // el cuerpo va ARRIBA de las patas

  return (
    <Group>
      {/* Patas: fanean desde el cuerpo (angosto) hacia los 3 huecos (más separados) */}
      <Line points={[x1 - cuerpoR * 0.5, cuerpoY + cuerpoR * 0.9, x1, y1]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />
      <Line points={[cx, cuerpoY + cuerpoR * 0.9, midX, midY]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />
      <Line points={[x2 + cuerpoR * 0.5, cuerpoY + cuerpoR * 0.9, x2, y2]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />

      {/* Cuerpo TO-92: semicírculo (domo) + base recta, con gradiente + sombra */}
      <Shape
        sceneFunc={(ctx, shape) => {
          ctx.beginPath()
          ctx.arc(cx, cuerpoY, cuerpoR, Math.PI, 0, false) // domo superior
          ctx.lineTo(cx + cuerpoR, cuerpoY + cuerpoR * 0.9)
          ctx.lineTo(cx - cuerpoR, cuerpoY + cuerpoR * 0.9)
          ctx.closePath()
          ctx.fillStrokeShape(shape)
        }}
        fillLinearGradientStartPoint={{ x: 0, y: -cuerpoR }}
        fillLinearGradientEndPoint={{ x: 0, y: cuerpoR }}
        fillLinearGradientColorStops={[0, '#4b4b4e', 0.5, '#2a2a2d', 1, '#151517']}
        stroke="#000"
        strokeWidth={1}
        shadowColor="black"
        shadowBlur={6}
        shadowOpacity={0.4}
        shadowOffset={{ x: 0, y: 2 }}
        perfectDrawEnabled={false}
      />

      {/* Cara plana (marca de orientación real del TO-92) */}
      <Rect
        x={cx - cuerpoR * 0.75}
        y={cuerpoY - cuerpoR * 0.15}
        width={cuerpoR * 1.5}
        height={cuerpoR * 1.05}
        fill="rgba(0,0,0,0.25)"
        cornerRadius={1}
        listening={false}
      />

      {/* Brillo superior del domo */}
      <Rect
        x={cx - cuerpoR * 0.5}
        y={cuerpoY - cuerpoR * 0.85}
        width={cuerpoR}
        height={2}
        cornerRadius={1}
        fill="rgba(255,255,255,0.2)"
        listening={false}
      />

      {/* Etiquetas B / C / E bajo cada pata, como en un datasheet */}
      <Text x={x1 - 4} y={y1 + 4} text="E" fontSize={9} fill="#6b7280" fontStyle="bold" />
      <Text x={midX - 4} y={midY + 4} text="B" fontSize={9} fill="#6b7280" fontStyle="bold" />
      <Text x={x2 - 4} y={y2 + 4} text="C" fontSize={9} fill="#6b7280" fontStyle="bold" />
    </Group>
  )
}

export default Transistor

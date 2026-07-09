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
  // El cuerpo SIEMPRE se centra en la pata del MEDIO (base) — no en el
  // punto medio entre E y C. Así el dibujo queda anclado a la coordenada
  // real de la base y nunca se ve "corrido" hacia un lado.
  const midX = x3 ?? (x1 + x2) / 2
  const midY = y3 ?? (y1 + y2) / 2 - Math.abs(x2 - x1) * 0.15 // si no hay 3ra pata real, la "sube" un poco

  // El radio del cuerpo es FIJO (no proporcional a la separación de las
  // patas): en esta app las 3 patas pueden quedar muy separadas (ej.
  // transistor vertical cruzando varias filas — E/B/C en huecos distintos,
  // no adyacentes como en un TO-92 real). Si el cuerpo escalara con esa
  // distancia terminaría tapando huecos vecinos; al ser fijo, cada pata
  // queda unida a su hueco exacto por una pata (recta) más o menos larga,
  // pero el cuerpo mismo nunca invade huecos que no le corresponden.
  const cuerpoR = 13
  const cuerpoY = Math.min(y1, y2, midY) - cuerpoR * 1.4 // el cuerpo va ARRIBA de las patas

  return (
    <Group>
      {/* Patas: van desde el punto de anclaje en el cuerpo (fan-out chico y
          fijo alrededor de midX) hasta el hueco REAL de cada pata — línea
          continua y diagonal si el hueco queda lejos, para que se vea
          claramente conectada (antes el punto de partida quedaba pegado
          al propio hueco y la pata nunca llegaba a tocar el cuerpo). */}
      <Line points={[midX - cuerpoR * 0.5, cuerpoY + cuerpoR * 0.9, x1, y1]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />
      <Line points={[midX, cuerpoY + cuerpoR * 0.9, midX, midY]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />
      <Line points={[midX + cuerpoR * 0.5, cuerpoY + cuerpoR * 0.9, x2, y2]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />

      {/* Cuerpo TO-92: semicírculo (domo) + base recta, con gradiente + sombra */}
      <Shape
        sceneFunc={(ctx, shape) => {
          ctx.beginPath()
          ctx.arc(midX, cuerpoY, cuerpoR, Math.PI, 0, false) // domo superior
          ctx.lineTo(midX + cuerpoR, cuerpoY + cuerpoR * 0.9)
          ctx.lineTo(midX - cuerpoR, cuerpoY + cuerpoR * 0.9)
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
        x={midX - cuerpoR * 0.75}
        y={cuerpoY - cuerpoR * 0.15}
        width={cuerpoR * 1.5}
        height={cuerpoR * 1.05}
        fill="rgba(0,0,0,0.25)"
        cornerRadius={1}
        listening={false}
      />

      {/* Brillo superior del domo */}
      <Rect
        x={midX - cuerpoR * 0.5}
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

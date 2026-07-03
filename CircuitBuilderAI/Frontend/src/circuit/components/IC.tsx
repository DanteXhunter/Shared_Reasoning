import { Group, Rect, Circle, Arc, Text } from 'react-konva'

// Componente de LIBRERÍA: Circuito integrado (chip DIP, ej. 555, op-amp).
// Patrón distinto a todo lo demás: cuerpo rectangular negro con pines
// metálicos a ambos lados + muesca y punto que marcan el pin 1
// (orientación). Autocontenido: se posiciona por (x,y) + tamaño + nº pines.
type Props = {
  x: number       // esquina superior izquierda del cuerpo
  y: number
  width: number
  pins?: number   // total de pines (par); la mitad por lado
  label?: string  // ej. "NE555"
}

function IC({ x, y, width, pins = 8, label = 'IC' }: Props) {
  const porLado = Math.max(1, Math.floor(pins / 2))
  const pinGap = width / porLado
  const height = Math.max(34, pinGap * 1.6)
  const pinW = pinGap * 0.35
  const pinH = 6

  return (
    <Group>
      {/* Pines superiores e inferiores */}
      {Array.from({ length: porLado }).map((_, i) => {
        const px = x + pinGap * (i + 0.5) - pinW / 2
        return (
          <Group key={i}>
            <Rect x={px} y={y - pinH} width={pinW} height={pinH}
              fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: pinH }}
              fillLinearGradientColorStops={[0, '#e5e7eb', 1, '#9ca3af']} listening={false} />
            <Rect x={px} y={y + height} width={pinW} height={pinH}
              fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: pinH }}
              fillLinearGradientColorStops={[0, '#9ca3af', 1, '#e5e7eb']} listening={false} />
          </Group>
        )
      })}

      {/* Cuerpo del chip (plástico negro con gradiente) */}
      <Rect
        x={x} y={y} width={width} height={height} cornerRadius={3}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: height }}
        fillLinearGradientColorStops={[0, '#3f3f46', 0.5, '#27272a', 1, '#18181b']}
        stroke="#000" strokeWidth={1}
        shadowColor="black" shadowBlur={7} shadowOpacity={0.45} shadowOffset={{ x: 0, y: 3 }}
        perfectDrawEnabled={false}
      />

      {/* Muesca semicircular (marca de orientación) en el borde izquierdo */}
      <Arc x={x} y={y + height / 2} innerRadius={0} outerRadius={5} angle={180} rotation={-90} fill="#0a0a0a" listening={false} />

      {/* Punto que marca el PIN 1 (esquina inferior izquierda) */}
      <Circle x={x + 6} y={y + height - 6} radius={2} fill="#6b7280" listening={false} />

      {/* Brillo superior */}
      <Rect x={x + 3} y={y + 2} width={width - 6} height={2} cornerRadius={1} fill="rgba(255,255,255,0.12)" listening={false} />

      {/* Serigrafía (nombre del chip) */}
      <Text x={x} y={y + height / 2 - 5} width={width} align="center" text={label} fontSize={9} fill="#d4d4d8" fontStyle="bold" listening={false} />
    </Group>
  )
}

export default IC

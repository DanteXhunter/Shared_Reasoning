import { Group, Line, Circle, Rect } from 'react-konva'

// Componente de LIBRERÍA: Cable / jumper Dupont — con lujo:
// sombra de profundidad, funda de color con brillo longitudinal (sheen),
// y puntas metálicas (el pin plateado que entra al hueco). Un jumper ES un
// componente (lo dijo el usuario): conecta dos huecos, color = convención (§7.B).
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
  color?: string
}

// Aclara un hex para el brillo de la funda.
function lighten(hex: string, amt: number): string {
  if (!hex.startsWith('#')) return hex
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, ((n >> 16) & 255) + amt)
  const g = Math.min(255, ((n >> 8) & 255) + amt)
  const b = Math.min(255, (n & 255) + amt)
  return `rgb(${r},${g},${b})`
}

function Wire({ x1, y1, x2, y2, color = '#dc2626' }: Props) {
  // Arco de la funda: se eleva en el centro (los jumpers no van rectos al ras).
  const midX = (x1 + x2) / 2
  const dist = Math.hypot(x2 - x1, y2 - y1)
  const lift = Math.min(24, 10 + dist * 0.12) // más largo = más arco
  const midY = (y1 + y2) / 2 - lift
  const pts = [x1, y1, midX, midY, x2, y2]

  return (
    <Group>
      {/* Sombra de profundidad (desplazada hacia abajo) */}
      <Line points={[x1, y1 + 2.5, midX, midY + 2.5, x2, y2 + 2.5]} stroke="rgba(0,0,0,0.22)" strokeWidth={5} lineCap="round" tension={0.5} listening={false} perfectDrawEnabled={false} />

      {/* Funda de color (cuerpo del cable) */}
      <Line points={pts} stroke={color} strokeWidth={4.5} lineCap="round" tension={0.5} perfectDrawEnabled={false} />
      {/* Brillo longitudinal (sheen sobre la funda) */}
      <Line points={pts} stroke={lighten(color, 90)} strokeWidth={1.4} lineCap="round" tension={0.5} opacity={0.7} listening={false} perfectDrawEnabled={false} />

      {/* Puntas metálicas: pin plateado que entra al hueco, en cada extremo */}
      {[[x1, y1], [x2, y2]].map(([px, py], i) => (
        <Group key={i}>
          {/* casquillo negro (crimp) en la base del pin */}
          <Rect x={px - 2.5} y={py - 8} width={5} height={7} cornerRadius={1.2} fill="#2b2f36" listening={false} />
          {/* pin metálico */}
          <Rect
            x={px - 1.6} y={py - 4} width={3.2} height={7} cornerRadius={1}
            fillLinearGradientStartPoint={{ x: -1.6, y: 0 }} fillLinearGradientEndPoint={{ x: 1.6, y: 0 }}
            fillLinearGradientColorStops={[0, '#9aa0a8', 0.5, '#e6e9ee', 1, '#8b9099']}
            listening={false} perfectDrawEnabled={false}
          />
          {/* remache donde la funda se une al pin */}
          <Circle x={px} y={py - 6.5} radius={2.6} fill={color} stroke={lighten(color, -40)} strokeWidth={0.6} listening={false} />
        </Group>
      ))}
    </Group>
  )
}

export default Wire

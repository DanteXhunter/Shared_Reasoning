import { Group, Line, Rect, Text } from 'react-konva'

// Componente de LIBRERÍA: Relé SPDT (ej. tipo SRD, azul).
// Caja azul rectangular con serigrafía del esquema de contactos.
// x1/x2 = pines extremos (bobina/contactos), es un bloque como el IC.
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
}

function Relay({ x1, y1, x2, y2 }: Props) {
  const midX = (x1 + x2) / 2
  const legsY = Math.max(y1, y2)
  const bodyW = Math.max(Math.abs(x2 - x1) + 12, 40)
  const bodyH = 34
  const bx = midX - bodyW / 2
  const by = legsY - bodyH - 10

  return (
    <Group>
      {/* Pines (5: 2 bobina + 3 contactos — dibujo esquemático de extremos) */}
      {[x1, midX, x2].map((px, i) => (
        <Line key={i} points={[px, legsY, px, by + bodyH - 1]} stroke="#9ca3af" strokeWidth={2} lineCap="round" perfectDrawEnabled={false} />
      ))}

      {/* Caja azul (cuerpo del relé, con volumen) */}
      <Rect
        x={bx} y={by} width={bodyW} height={bodyH} cornerRadius={2.5}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: bodyH }}
        fillLinearGradientColorStops={[0, '#3b6fd4', 0.5, '#2b55ab', 1, '#1e3d80']}
        stroke="#152a5c" strokeWidth={1}
        shadowColor="black" shadowBlur={5} shadowOpacity={0.4} shadowOffset={{ x: 0, y: 2 }}
        perfectDrawEnabled={false}
      />
      {/* Brillo superior */}
      <Rect x={bx + 2} y={by + 2} width={bodyW - 4} height={3} cornerRadius={1.5} fill="rgba(255,255,255,0.18)" listening={false} />

      {/* Serigrafía: esquema de contactos (rectángulo interno + líneas) */}
      <Rect x={bx + 5} y={by + 8} width={bodyW - 10} height={bodyH - 16} cornerRadius={1} stroke="#a9c2f0" strokeWidth={0.8} listening={false} />
      <Line points={[bx + 8, by + bodyH / 2, bx + bodyW - 8, by + bodyH / 2]} stroke="#a9c2f0" strokeWidth={0.8} dash={[2, 2]} listening={false} />
      <Text x={bx} y={by + 3} width={bodyW} align="center" text="RELAY" fontSize={6.5} fontStyle="bold" fill="#dbe6fb" listening={false} />
    </Group>
  )
}

export default Relay

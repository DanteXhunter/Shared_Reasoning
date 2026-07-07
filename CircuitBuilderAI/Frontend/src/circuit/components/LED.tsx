import { Group, Line, Circle, Rect, Ellipse } from 'react-konva'

// Componente de LIBRERÍA: LED (diodo emisor de luz) — 5 mm THT, con lujo:
// domo con gradiente radial (volumen de plástico translúcido), halo de brillo,
// reborde/pestaña de la base, y el lado plano del CÁTODO (x2) como en el real.
// Convención física: ánodo (+) = pata larga (x1) · cátodo (−) = pata corta + lado plano (x2).
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
  color?: string // color del domo
}

// Aclara/oscurece un hex para armar el gradiente del domo.
function tint(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + amt))
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt))
  const b = Math.min(255, Math.max(0, (n & 255) + amt))
  return `rgb(${r},${g},${b})`
}

function LED({ x1, y1, x2, y2, color = '#ef4444' }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const r = 9.5

  return (
    <Group>
      {/* Halo de emisión (glow suave alrededor del domo) */}
      <Circle x={midX} y={midY} radius={r + 5} fill={color} opacity={0.18} listening={false} />

      {/* Patas: la del ánodo (x1) es más larga que la del cátodo (x2) */}
      <Line points={[x1, y1, midX - r + 2, midY + 4]} stroke="#b8bcc4" strokeWidth={2} lineCap="round" perfectDrawEnabled={false} />
      <Line points={[midX + r - 2, midY + 4, x2, y2]} stroke="#9ca3af" strokeWidth={2} lineCap="round" perfectDrawEnabled={false} />

      {/* Pestaña / reborde de la base (el aro que sobresale abajo del domo) */}
      <Ellipse
        x={midX} y={midY + r - 1} radiusX={r + 1.5} radiusY={3.5}
        fill={tint(color, -50)} stroke={tint(color, -90)} strokeWidth={0.8}
        listening={false} perfectDrawEnabled={false}
      />
      {/* Lado plano del cátodo (corte recto sobre la pestaña, lado x2) */}
      <Rect x={midX + r - 1.5} y={midY + r - 5} width={2.5} height={8} fill={tint(color, -60)} listening={false} />

      {/* Cuerpo del domo: gradiente radial (brillo arriba-izq → color → borde oscuro) */}
      <Circle
        x={midX} y={midY} radius={r}
        fillRadialGradientStartPoint={{ x: -r * 0.35, y: -r * 0.4 }}
        fillRadialGradientEndPoint={{ x: 0, y: 0 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndRadius={r * 1.15}
        fillRadialGradientColorStops={[0, tint(color, 120), 0.45, color, 1, tint(color, -55)]}
        stroke={tint(color, -80)} strokeWidth={0.8}
        shadowColor="black" shadowBlur={4} shadowOpacity={0.25} shadowOffset={{ x: 0, y: 2 }}
        perfectDrawEnabled={false}
      />

      {/* Reflejo especular (punto de luz brillante del plástico) */}
      <Ellipse x={midX - r * 0.35} y={midY - r * 0.45} radiusX={r * 0.3} radiusY={r * 0.42} fill="#ffffff" opacity={0.75} listening={false} />
    </Group>
  )
}

export default LED

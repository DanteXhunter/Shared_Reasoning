import { Group, Line, Rect, Circle } from 'react-konva'

// Componente de LIBRERÍA: Potenciómetro (resistencia variable, 3 patas).
// Cuerpo azul con perilla/eje giratorio arriba y una flecha indicadora.
// Mismo patrón de 3 patas que el transistor (x3/y3 = pata central).
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
  x3?: number
  y3?: number
}

function Potentiometer({ x1, y1, x2, y2, x3, y3 }: Props) {
  // El cuerpo SIEMPRE se centra en la pata del MEDIO (wiper) — no en el
  // punto medio entre las otras dos — para que quede anclado a su
  // coordenada real y nunca se vea "corrido" hacia un lado.
  const midX = x3 ?? (x1 + x2) / 2
  const midY = y3 ?? (y1 + y2) / 2
  // Cuerpo de tamaño FIJO (no proporcional a la separación de las patas —
  // mismo criterio que Transistor.tsx: si las 3 patas quedan muy separadas
  // el cuerpo no debe crecer ni invadir huecos vecinos).
  const bodyW = 46
  const bodyH = 22
  const bodyY = Math.min(y1, y2, midY) - bodyH - 6
  const attachY = bodyY + bodyH
  const fan = bodyW * 0.32 // separación chica entre los 3 puntos de anclaje en el cuerpo

  return (
    <Group>
      {/* Patas: del punto de anclaje en el cuerpo (fan-out chico y fijo
          alrededor de midX) hasta el hueco REAL de cada una — diagonal si
          queda lejos, para que se vea claramente conectada. */}
      <Line points={[midX - fan, attachY, x1, y1]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />
      <Line points={[midX, attachY, midX, midY]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />
      <Line points={[midX + fan, attachY, x2, y2]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />

      {/* Cuerpo */}
      <Rect
        x={midX - bodyW / 2} y={bodyY} width={bodyW} height={bodyH} cornerRadius={4}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: bodyH }}
        fillLinearGradientColorStops={[0, '#3b82f6', 0.5, '#1d4ed8', 1, '#1e3a8a']}
        stroke="#172554" strokeWidth={1}
        shadowColor="black" shadowBlur={5} shadowOpacity={0.35} shadowOffset={{ x: 0, y: 2 }}
        perfectDrawEnabled={false}
      />

      {/* Perilla/eje giratorio */}
      <Circle x={midX} y={bodyY - 2} radius={7}
        fillRadialGradientStartPoint={{ x: -2, y: -2 }} fillRadialGradientEndPoint={{ x: 0, y: 0 }}
        fillRadialGradientStartRadius={0} fillRadialGradientEndRadius={9}
        fillRadialGradientColorStops={[0, '#e5e7eb', 1, '#9ca3af']}
        stroke="#6b7280" perfectDrawEnabled={false} />
      {/* Muesca indicadora de la perilla */}
      <Line points={[midX, bodyY - 2, midX + 4, bodyY - 7]} stroke="#374151" strokeWidth={1.5} lineCap="round" />
    </Group>
  )
}

export default Potentiometer

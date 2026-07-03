import { Group, Line, Rect, Text } from 'react-konva'

// Componente de LIBRERÍA: Capacitor electrolítico (POLARIZADO).
// Cilindro de aluminio azul oscuro, con franja clara que marca el
// terminal negativo (x2 = cátodo/negativo, por orden de pines).
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
  valor?: string // ej. "100µF"
}

function ElectrolyticCapacitor({ x1, y1, x2, y2, valor }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const bodyW = Math.abs(x2 - x1) * 0.5
  const bodyH = 26

  return (
    <Group>
      {/* Patas */}
      <Line points={[x1, y1, midX - bodyW / 2, midY]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />
      <Line points={[midX + bodyW / 2, midY, x2, y2]} stroke="#9ca3af" strokeWidth={2} perfectDrawEnabled={false} />

      {/* Cuerpo cilíndrico (visto de lado): gradiente azul aluminio + sombra */}
      <Rect
        x={midX - bodyW / 2}
        y={midY - bodyH / 2}
        width={bodyW}
        height={bodyH}
        cornerRadius={4}
        fillLinearGradientStartPoint={{ x: 0, y: -bodyH / 2 }}
        fillLinearGradientEndPoint={{ x: 0, y: bodyH / 2 }}
        fillLinearGradientColorStops={[0, '#3b4a6b', 0.5, '#1e2a44', 1, '#0f1729']}
        stroke="#0a1020"
        strokeWidth={1}
        shadowColor="black"
        shadowBlur={6}
        shadowOpacity={0.4}
        shadowOffset={{ x: 0, y: 3 }}
        perfectDrawEnabled={false}
      />

      {/* Brillo lateral (reflejo del aluminio) */}
      <Rect x={midX - bodyW / 2 + 3} y={midY - bodyH / 2 + 2} width={2.5} height={bodyH - 4} fill="rgba(255,255,255,0.25)" listening={false} />

      {/* Franja del negativo (lado del cátodo = x2) con signos "−" */}
      <Rect x={midX + bodyW / 2 - 7} y={midY - bodyH / 2} width={7} height={bodyH} fill="#cbd5e1" cornerRadius={1} listening={false} />
      <Text x={midX + bodyW / 2 - 6} y={midY - 6} text="−−" fontSize={8} fill="#334155" fontStyle="bold" listening={false} />

      {/* Valor impreso en el cuerpo */}
      {valor && <Text x={midX - bodyW / 2 + 4} y={midY - 5} text={valor} fontSize={8} fill="#e2e8f0" listening={false} />}
    </Group>
  )
}

export default ElectrolyticCapacitor

import { Group, Line, Rect, Circle, Text } from 'react-konva'

// Componente de LIBRERÍA: Regulador de voltaje TO-220 (ej. 7805).
// Cuerpo plástico negro + pestaña metálica (disipador) con agujero de montaje.
// 3 patas: Vin (x1) · GND (x3, centro) · Vout (x2).
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
  x3?: number
  y3?: number
  label?: string // ej. "7805"
}

function VoltageRegulator({ x1, y1, x2, y2, x3, y3, label = '7805' }: Props) {
  const midX = (x1 + x2) / 2
  const legsY = Math.max(y1, y2)
  const bodyW = 30
  const bodyH = 26
  const bodyX = midX - bodyW / 2
  const bodyY = legsY - bodyH - 12
  const tabH = 8

  const cx3 = x3 ?? midX
  const cy3 = y3 ?? legsY

  return (
    <Group>
      {/* 3 patas metálicas */}
      {[[x1, y1], [cx3, cy3], [x2, y2]].map(([px, py], i) => (
        <Line key={i} points={[px, py, px, bodyY + bodyH - 1]} stroke="#9ca3af" strokeWidth={2} lineCap="round" perfectDrawEnabled={false} />
      ))}

      {/* Pestaña metálica (disipador) arriba, con agujero de montaje */}
      <Rect
        x={bodyX + 2} y={bodyY - tabH} width={bodyW - 4} height={tabH + 4} cornerRadius={2}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: tabH }}
        fillLinearGradientColorStops={[0, '#eef1f4', 0.5, '#b8bec7', 1, '#8b929c']}
        stroke="#6b7280" strokeWidth={0.8} listening={false} perfectDrawEnabled={false}
      />
      <Circle x={midX} y={bodyY - tabH / 2 + 1} radius={2.6} fill="#5b616b" stroke="#3a3f47" strokeWidth={0.8} listening={false} />

      {/* Cuerpo plástico negro (encapsulado) */}
      <Rect
        x={bodyX} y={bodyY} width={bodyW} height={bodyH} cornerRadius={2}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: bodyH }}
        fillLinearGradientColorStops={[0, '#3a3f46', 0.5, '#23262b', 1, '#141619']}
        stroke="#0a0b0d" strokeWidth={1}
        shadowColor="black" shadowBlur={5} shadowOpacity={0.4} shadowOffset={{ x: 0, y: 2 }}
        perfectDrawEnabled={false}
      />
      {/* Brillo superior del plástico */}
      <Rect x={bodyX + 2} y={bodyY + 2} width={bodyW - 4} height={2.5} cornerRadius={1} fill="rgba(255,255,255,0.14)" listening={false} />

      {/* Serigrafía del modelo */}
      <Text x={bodyX} y={bodyY + bodyH / 2 - 4} width={bodyW} align="center" text={label} fontSize={7.5} fontStyle="bold" fill="#d1d5db" listening={false} />
    </Group>
  )
}

export default VoltageRegulator

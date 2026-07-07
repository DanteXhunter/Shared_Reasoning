import { Group, Line, Rect, Circle, Shape } from 'react-konva'

// Componente de LIBRERÍA: Display de 7 segmentos (1 dígito).
// Módulo negro con los 7 segmentos + punto decimal en rojo (algunos
// encendidos para verse vivo). x1/x2 = pines extremos de la fila inferior.
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
  digito?: number // 0-9, cuál dígito mostrar encendido (por defecto 8 = todos)
}

// Mapa de segmentos encendidos por dígito. Orden: a,b,c,d,e,f,g
const SEG: Record<number, boolean[]> = {
  0: [true, true, true, true, true, true, false],
  2: [true, true, false, true, true, false, true],
  3: [true, true, true, true, false, false, true],
  5: [true, false, true, true, false, true, true],
  8: [true, true, true, true, true, true, true],
}

function SevenSegment({ x1, y1, x2, y2, digito = 8 }: Props) {
  const midX = (x1 + x2) / 2
  const legsY = Math.max(y1, y2)
  const bodyW = 26
  const bodyH = 38
  const bx = midX - bodyW / 2
  const by = legsY - bodyH - 10

  const on = SEG[digito] ?? SEG[8]
  const RED_ON = '#ff3b30'
  const RED_OFF = '#3a1512'

  // Geometría del "8": esquina sup-izq del dígito y tamaños.
  const dx = bx + 7
  const dy = by + 6
  const dw = 12 // ancho del dígito
  const dh = 24 // alto del dígito
  const t = 2.4 // grosor de segmento
  const seg = (pts: number[], lit: boolean) => (
    <Shape
      sceneFunc={(ctx, s) => {
        ctx.beginPath()
        ctx.moveTo(pts[0], pts[1])
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
        ctx.closePath()
        ctx.fillShape(s)
      }}
      fill={lit ? RED_ON : RED_OFF}
      shadowColor={lit ? RED_ON : undefined}
      shadowBlur={lit ? 4 : 0}
      shadowOpacity={lit ? 0.8 : 0}
      listening={false}
    />
  )

  return (
    <Group>
      {/* Pines (extremos de las 2 filas de 5) */}
      <Line points={[bx + 3, by + bodyH, bx + 3, by + bodyH + 3, x1, y1]} stroke="#9ca3af" strokeWidth={2} lineCap="round" perfectDrawEnabled={false} />
      <Line points={[bx + bodyW - 3, by + bodyH, bx + bodyW - 3, by + bodyH + 3, x2, y2]} stroke="#9ca3af" strokeWidth={2} lineCap="round" perfectDrawEnabled={false} />

      {/* Cuerpo del módulo (negro con volumen) */}
      <Rect
        x={bx} y={by} width={bodyW} height={bodyH} cornerRadius={2.5}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: bodyH }}
        fillLinearGradientColorStops={[0, '#2a2d33', 0.5, '#17191d', 1, '#0c0d10']}
        stroke="#050608" strokeWidth={1}
        shadowColor="black" shadowBlur={5} shadowOpacity={0.4} shadowOffset={{ x: 0, y: 2 }}
        perfectDrawEnabled={false}
      />

      {/* Segmentos a..g (con leve inclinación itálica del dígito) */}
      {seg([dx + t, dy, dx + dw - t, dy, dx + dw - t * 1.8, dy + t, dx + t * 1.8, dy + t], on[0])}{/* a */}
      {seg([dx + dw, dy + t, dx + dw, dy + dh / 2 - t, dx + dw - t, dy + dh / 2, dx + dw - t, dy + t * 1.8], on[1])}{/* b */}
      {seg([dx + dw, dy + dh / 2 + t, dx + dw, dy + dh - t, dx + dw - t, dy + dh - t * 1.8, dx + dw - t, dy + dh / 2 + t], on[2])}{/* c */}
      {seg([dx + t, dy + dh, dx + dw - t, dy + dh, dx + dw - t * 1.8, dy + dh - t, dx + t * 1.8, dy + dh - t], on[3])}{/* d */}
      {seg([dx, dy + dh / 2 + t, dx, dy + dh - t, dx + t, dy + dh - t * 1.8, dx + t, dy + dh / 2 + t], on[4])}{/* e */}
      {seg([dx, dy + t, dx, dy + dh / 2 - t, dx + t, dy + dh / 2, dx + t, dy + t * 1.8], on[5])}{/* f */}
      {seg([dx + t, dy + dh / 2, dx + dw - t, dy + dh / 2, dx + dw - t * 1.8, dy + dh / 2 + t, dx + t * 1.8, dy + dh / 2 + t], on[6])}{/* g (aprox) */}

      {/* Punto decimal */}
      <Circle x={dx + dw + 3} y={dy + dh} radius={1.6} fill={RED_OFF} listening={false} />
    </Group>
  )
}

export default SevenSegment

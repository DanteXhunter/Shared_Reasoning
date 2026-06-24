import { Group, Line, Rect } from 'react-konva'

// ============================================================
//  Componente de LIBRERÍA: Resistor.
//  Es PURO visual: recibe las coordenadas de sus dos patas (en píxeles)
//  y se dibuja. No sabe nada de la protoboard ni del LLM.
//  = un Group con líneas (patas) + un cuerpo (Rect) + bandas de color.
// ============================================================

type Props = {
  x1: number // pata 1 (px)
  y1: number
  x2: number // pata 2 (px)
  y2: number
}

function Resistor({ x1, y1, x2, y2 }: Props) {
  // Punto medio: ahí va el cuerpo del resistor
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const length = Math.abs(x2 - x1)
  const bodyW = length * 0.55 // el cuerpo ocupa el 55% de la distancia entre patas
  const bodyH = 12

  return (
    <Group>
      {/* Patas: líneas desde cada hueco hasta el cuerpo */}
      <Line points={[x1, y1, midX - bodyW / 2, midY]} stroke="#9ca3af" strokeWidth={2} />
      <Line points={[midX + bodyW / 2, midY, x2, y2]} stroke="#9ca3af" strokeWidth={2} />

      {/* Cuerpo del resistor (beige) */}
      <Rect
        x={midX - bodyW / 2}
        y={midY - bodyH / 2}
        width={bodyW}
        height={bodyH}
        cornerRadius={4}
        fill="#d9b382"
        stroke="#a07d4f"
      />

      {/* Bandas de color (decorativas por ahora; luego = valor real) */}
      <Rect x={midX - bodyW * 0.25} y={midY - bodyH / 2} width={3} height={bodyH} fill="#7f1d1d" />
      <Rect x={midX - bodyW * 0.10} y={midY - bodyH / 2} width={3} height={bodyH} fill="#1e3a8a" />
      <Rect x={midX + bodyW * 0.10} y={midY - bodyH / 2} width={3} height={bodyH} fill="#78350f" />
    </Group>
  )
}

export default Resistor

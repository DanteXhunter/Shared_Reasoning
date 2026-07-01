import { Group, Line, Text } from 'react-konva'

// Componente de LIBRERÍA: fuente / generador DC (símbolo de batería).
// Placa larga = positivo (+), placa corta y gruesa = negativo (−).
type Props = {
  x1: number
  y1: number
  x2: number
  y2: number
}

function Source({ x1, y1, x2, y2 }: Props) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2

  return (
    <Group>
      {/* Patas */}
      <Line points={[x1, y1, midX - 5, midY]} stroke="#9ca3af" strokeWidth={2} />
      <Line points={[midX + 5, midY, x2, y2]} stroke="#9ca3af" strokeWidth={2} />

      {/* Placa + (larga y delgada) */}
      <Line points={[midX - 5, midY - 11, midX - 5, midY + 11]} stroke="#e11d48" strokeWidth={2} />
      {/* Placa − (corta y gruesa) */}
      <Line points={[midX + 5, midY - 6, midX + 5, midY + 6]} stroke="#2563eb" strokeWidth={4} />

      <Text x={midX - 14} y={midY - 22} text="+" fill="#e11d48" fontStyle="bold" />
      <Text x={midX + 9} y={midY - 22} text="−" fill="#2563eb" fontStyle="bold" />
    </Group>
  )
}

export default Source

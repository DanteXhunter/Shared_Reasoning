import { Stage, Layer, Rect, Circle, Text, Line } from 'react-konva'
import {
  ROWS, COLS, SPACING, HOLE_R, MARGIN_X, MARGIN_Y,
  TOP_PLUS_Y, TOP_MINUS_Y, rowY, holePos, railHoleX, bottomPlusY, bottomMinusY, boardSize,
} from '../circuit/grid'
import Resistor from '../circuit/components/Resistor'
import LED from '../circuit/components/LED'
import Capacitor from '../circuit/components/Capacitor'
import Wire from '../circuit/components/Wire'

// Dibuja un riel de poder (una fila de huecos con su línea de color y signo).
function PowerRail({ y, color, sign }: { y: number; color: string; sign: string }) {
  const width = boardSize().width
  return (
    <>
      <Line points={[MARGIN_X, y, width - MARGIN_X, y]} stroke={color} strokeWidth={2} />
      <Text x={20} y={y - 6} text={sign} fill={color} fontStyle="bold" />
      <Text x={width - 30} y={y - 6} text={sign} fill={color} fontStyle="bold" />
      {Array.from({ length: COLS }).map((_, c) => (
        <Circle key={`rail-${sign}-${c}`} x={railHoleX(c + 1)} y={y} radius={HOLE_R - 1} fill="#fff" stroke="#b9b7b1" />
      ))}
    </>
  )
}

function Protoboard() {
  const { width, height } = boardSize()

  return (
    <Stage width={width} height={height}>
      {/* CAPA 1: la protoboard (fija) */}
      <Layer>
        <Rect x={0} y={0} width={width} height={height} fill="#e7e5e0" cornerRadius={12} stroke="#c9c7c1" />

        {/* Rieles de poder superiores */}
        <PowerRail y={TOP_PLUS_Y} color="#e11d48" sign="+" />
        <PowerRail y={TOP_MINUS_Y} color="#2563eb" sign="−" />

        {/* Números de columna */}
        {Array.from({ length: COLS }).map((_, c) => (
          <Text key={`col-${c}`} x={MARGIN_X + c * SPACING - 3} y={MARGIN_Y - 20} text={`${c + 1}`} fontSize={9} fill="#7c7a74" />
        ))}

        {/* Letras de fila */}
        {ROWS.map((label, r) => (
          <Text key={`row-${label}`} x={MARGIN_X - 28} y={rowY(r) - 5} text={label} fontSize={11} fill="#7c7a74" />
        ))}

        {/* Grilla de huecos principal */}
        {ROWS.map((label, r) =>
          Array.from({ length: COLS }).map((_, c) => (
            <Circle key={`${label}-${c}`} x={MARGIN_X + c * SPACING} y={rowY(r)} radius={HOLE_R} fill="#ffffff" stroke="#b9b7b1" />
          )),
        )}

        {/* Rieles de poder inferiores */}
        <PowerRail y={bottomPlusY()} color="#e11d48" sign="+" />
        <PowerRail y={bottomMinusY()} color="#2563eb" sign="−" />
      </Layer>

      {/* CAPA 2: los componentes (cambian por paso) — simulan el JSON del LLM */}
      <Layer>
        {/* R1: resistor A5 → A9 */}
        <Resistor {...pins('A', 5, 'A', 9)} />
        {/* D1: LED C12 → C15 */}
        <LED {...pins('C', 12, 'C', 15)} />
        {/* C1: capacitor F20 → F23 */}
        <Capacitor {...pins('F', 20, 'F', 23)} />
        {/* Cable: A9 → riel + de la columna 9 */}
        <Wire x1={holePos('A', 9).x} y1={holePos('A', 9).y} x2={railHoleX(9)} y2={TOP_PLUS_Y} />
      </Layer>
    </Stage>
  )
}

// Helper: convierte dos coordenadas de protoboard en las props {x1,y1,x2,y2}.
function pins(r1: string, c1: number, r2: string, c2: number) {
  const a = holePos(r1, c1)
  const b = holePos(r2, c2)
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
}

export default Protoboard

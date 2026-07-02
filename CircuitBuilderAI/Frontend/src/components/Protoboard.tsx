import { Fragment } from 'react'
import { Stage, Layer, Rect, Circle, Text, Line } from 'react-konva'
import {
  ROWS, COLS, SPACING, HOLE_R, MARGIN_X, MARGIN_Y,
  TOP_PLUS_Y, TOP_MINUS_Y, rowY, railHoleX, bottomPlusY, bottomMinusY, boardSize,
} from '../circuit/grid'
import Resistor from '../circuit/components/Resistor'
import LED from '../circuit/components/LED'
import Capacitor from '../circuit/components/Capacitor'
import Wire from '../circuit/components/Wire'
import Generic from '../circuit/components/Generic'
import Source from '../circuit/components/Source'
import Switch from '../circuit/components/Switch'
import Bulb from '../circuit/components/Bulb'
import type { ComponentePlano, CablePlano, NodoPlano } from '../circuit/types'

// Registro del catálogo: la llave "kind" elige qué dibujo de Konva usar.
const CATALOGO = {
  resistor: Resistor,
  led: LED,
  capacitor: Capacitor,
  source: Source,
  switch: Switch,
  bulb: Bulb,
  generic: Generic,
}

// Dibuja un riel de poder (fila de huecos con línea de color y signo).
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

type Props = {
  componentes?: ComponentePlano[]
  cables?: CablePlano[]
  nodos?: NodoPlano[]
}

function Protoboard({ componentes = [], cables = [], nodos = [] }: Props) {
  const { width, height } = boardSize()

  return (
    <Stage width={width} height={height}>
      {/* CAPA 1: la protoboard (fija) */}
      <Layer>
        <Rect x={0} y={0} width={width} height={height} fill="#e7e5e0" cornerRadius={12} stroke="#c9c7c1" />

        <PowerRail y={TOP_PLUS_Y} color="#e11d48" sign="+" />
        <PowerRail y={TOP_MINUS_Y} color="#2563eb" sign="−" />

        {Array.from({ length: COLS }).map((_, c) => (
          <Text key={`col-${c}`} x={MARGIN_X + c * SPACING - 3} y={MARGIN_Y - 20} text={`${c + 1}`} fontSize={9} fill="#7c7a74" />
        ))}
        {ROWS.map((label, r) => (
          <Text key={`row-${label}`} x={MARGIN_X - 28} y={rowY(r) - 5} text={label} fontSize={11} fill="#7c7a74" />
        ))}
        {ROWS.map((label, r) =>
          Array.from({ length: COLS }).map((_, c) => (
            <Circle key={`${label}-${c}`} x={MARGIN_X + c * SPACING} y={rowY(r)} radius={HOLE_R} fill="#ffffff" stroke="#b9b7b1" />
          )),
        )}

        <PowerRail y={bottomPlusY()} color="#e11d48" sign="+" />
        <PowerRail y={bottomMinusY()} color="#2563eb" sign="−" />
      </Layer>

      {/* CAPA 2: los componentes del netlist + sus cables */}
      <Layer>
        {/* Cables (van debajo de los componentes) */}
        {cables.map((cable, i) => (
          <Wire key={`cable-${i}`} x1={cable.x1} y1={cable.y1} x2={cable.x2} y2={cable.y2} color={cable.color ?? '#16a34a'} />
        ))}

        {/* Nodos (V_in, V_out, GND...): terminal de color + etiqueta */}
        {nodos.map((nodo) => (
          <Fragment key={`nodo-${nodo.label}`}>
            <Circle x={nodo.x} y={nodo.y} radius={6} fill={nodo.color} stroke="#1e293b" />
            <Text x={nodo.x - nodo.label.length * 3} y={nodo.y - 20} text={nodo.label} fontSize={10} fill={nodo.color} fontStyle="bold" />
          </Fragment>
        ))}

        {/* Componentes: cada uno elige su dibujo del catálogo según su "kind" */}
        {componentes.map((comp) => {
          const Dibujo = CATALOGO[comp.kind]
          const labelX = (comp.x1 + comp.x2) / 2 - comp.label.length * 3
          const labelY = Math.min(comp.y1, comp.y2) - 24
          return (
            <Fragment key={comp.id}>
              <Dibujo x1={comp.x1} y1={comp.y1} x2={comp.x2} y2={comp.y2} />
              <Text x={labelX} y={labelY} text={comp.label} fontSize={10} fill="#6d28d9" fontStyle="bold" />
            </Fragment>
          )
        })}
      </Layer>
    </Stage>
  )
}

export default Protoboard

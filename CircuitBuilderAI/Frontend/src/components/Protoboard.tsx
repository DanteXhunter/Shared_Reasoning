import { Fragment } from 'react'
import { Stage, Layer, Rect, Circle, Text, Line } from 'react-konva'
import {
  ROWS, COLS, SPACING, HOLE_R, MARGIN_X, MARGIN_Y,
  TOP_PLUS_Y, TOP_MINUS_Y, rowY, railHoleX, bottomPlusY, bottomMinusY, boardSize,
} from '../circuit/grid'
import Resistor from '../circuit/components/Resistor'
import LED from '../circuit/components/LED'
import Diode from '../circuit/components/Diode'
import Transistor from '../circuit/components/Transistor'
import Capacitor from '../circuit/components/Capacitor'
import ElectrolyticCapacitor from '../circuit/components/ElectrolyticCapacitor'
import Inductor from '../circuit/components/Inductor'
import Fuse from '../circuit/components/Fuse'
import Potentiometer from '../circuit/components/Potentiometer'
import PushButton from '../circuit/components/PushButton'
import IC from '../circuit/components/IC'
import Wire from '../circuit/components/Wire'
import Generic from '../circuit/components/Generic'
import Source from '../circuit/components/Source'
import Switch from '../circuit/components/Switch'
import Bulb from '../circuit/components/Bulb'
import type { ComponentePlano, CablePlano, NodoPlano, BateriaPlano } from '../circuit/types'

// Batería FÍSICA dibujada en el gutter izquierdo, con cables a los rieles.
// (La fuente del netlist no ocupa un hueco: energiza los rieles + y −.)
function BatteryEdge({ bateria, index }: { bateria: BateriaPlano; index: number }) {
  const cx = 40
  const topY = 14
  const botY = 58
  const w = 26
  const railX = railHoleX(2 + index * 2) // baterías múltiples usan columnas distintas
  return (
    <Fragment>
      {/* Cables a los rieles: rojo (+) arriba, negro (−) abajo */}
      <Line points={[cx, topY, cx, TOP_PLUS_Y, railX, TOP_PLUS_Y]} stroke="#dc2626" strokeWidth={2.5} lineCap="round" lineJoin="round" />
      <Line points={[cx, botY, cx, TOP_MINUS_Y, railX, TOP_MINUS_Y]} stroke="#1f2937" strokeWidth={2.5} lineCap="round" lineJoin="round" />

      {/* Cuerpo de la pila (vertical, metálico) */}
      <Rect
        x={cx - w / 2} y={topY} width={w} height={botY - topY} cornerRadius={4}
        fillLinearGradientStartPoint={{ x: -w / 2, y: 0 }} fillLinearGradientEndPoint={{ x: w / 2, y: 0 }}
        fillLinearGradientColorStops={[0, '#5b6472', 0.5, '#2f3742', 1, '#1a1f28']}
        stroke="#12161c" shadowColor="black" shadowBlur={6} shadowOpacity={0.4} shadowOffset={{ x: 2, y: 2 }}
        perfectDrawEnabled={false}
      />
      {/* Envoltura de color (etiqueta) */}
      <Rect x={cx - w / 2} y={topY + 10} width={w} height={botY - topY - 20}
        fillLinearGradientStartPoint={{ x: -w / 2, y: 0 }} fillLinearGradientEndPoint={{ x: w / 2, y: 0 }}
        fillLinearGradientColorStops={[0, '#f59e0b', 0.5, '#d97706', 1, '#b45309']} listening={false} />
      {/* Terminal + (nub) arriba */}
      <Rect x={cx - 4} y={topY - 4} width={8} height={5} cornerRadius={1} fill="#d1d5db" listening={false} />
      {/* Signos */}
      <Text x={cx + w / 2 + 2} y={topY - 2} text="+" fontSize={11} fill="#dc2626" fontStyle="bold" listening={false} />
      <Text x={cx + w / 2 + 2} y={botY - 12} text="−" fontSize={11} fill="#374151" fontStyle="bold" listening={false} />
      {bateria.valor && <Text x={cx - w / 2} y={(topY + botY) / 2 - 5} width={w} align="center" text={bateria.valor} fontSize={9} fill="#fff" fontStyle="bold" listening={false} />}
    </Fragment>
  )
}

// Registro del catálogo: la llave "kind" elige qué dibujo de Konva usar.
// (resistor, transistor, potentiometer e ic NO están aquí: necesitan
// props extra — se resuelven aparte en el render loop de abajo.)
const CATALOGO = {
  led: LED,
  diode: Diode,
  capacitor: Capacitor,
  electrolytic: ElectrolyticCapacitor,
  inductor: Inductor,
  fuse: Fuse,
  pushbutton: PushButton,
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
  baterias?: BateriaPlano[]
}

function Protoboard({ componentes = [], cables = [], nodos = [], baterias = [] }: Props) {
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
        {/* Baterías físicas al borde (energizan los rieles) */}
        {baterias.map((bat, i) => (
          <BatteryEdge key={`bat-${bat.id}`} bateria={bat} index={i} />
        ))}

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
          const labelX = (comp.x1 + comp.x2) / 2 - comp.label.length * 3
          const labelY = Math.min(comp.y1, comp.y2) - 24
          return (
            <Fragment key={comp.id}>
              {comp.kind === 'resistor' ? (
                // El resistor recibe datos crudos: calcula sus propias bandas de color.
                <Resistor
                  x1={comp.x1} y1={comp.y1} x2={comp.x2} y2={comp.y2}
                  valor={comp.valor} tolerancia={comp.tolerancia} potenciaNominal={comp.potenciaNominal}
                />
              ) : comp.kind === 'transistor' ? (
                // El transistor tiene una 3ra pata (base) — patrón distinto a los demás.
                <Transistor x1={comp.x1} y1={comp.y1} x2={comp.x2} y2={comp.y2} x3={comp.x3} y3={comp.y3} />
              ) : comp.kind === 'potentiometer' ? (
                <Potentiometer x1={comp.x1} y1={comp.y1} x2={comp.x2} y2={comp.y2} x3={comp.x3} y3={comp.y3} />
              ) : comp.kind === 'electrolytic' ? (
                <ElectrolyticCapacitor x1={comp.x1} y1={comp.y1} x2={comp.x2} y2={comp.y2} valor={comp.valor} />
              ) : comp.kind === 'ic' ? (
                // El IC no usa el patrón de patas: se dibuja como caja con pines.
                <IC x={Math.min(comp.x1, comp.x2)} y={Math.min(comp.y1, comp.y2) - 18} width={Math.abs(comp.x2 - comp.x1) || 60} label={comp.id} />
              ) : (
                (() => {
                  const Dibujo = CATALOGO[comp.kind]
                  return <Dibujo x1={comp.x1} y1={comp.y1} x2={comp.x2} y2={comp.y2} />
                })()
              )}
              <Text x={labelX} y={labelY} text={comp.label} fontSize={10} fill="#6d28d9" fontStyle="bold" />
            </Fragment>
          )
        })}
      </Layer>
    </Stage>
  )
}

export default Protoboard

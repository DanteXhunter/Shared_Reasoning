import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Stage, Layer, Group, Rect, Circle, Text, Line } from 'react-konva'
import type Konva from 'konva'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import {
  ROWS, COLS, SPACING, MARGIN_X, MARGIN_Y,
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
import Photoresistor from '../circuit/components/Photoresistor'
import Buzzer from '../circuit/components/Buzzer'
import Voltmeter from '../circuit/components/Voltmeter'
import VoltageRegulator from '../circuit/components/VoltageRegulator'
import Crystal from '../circuit/components/Crystal'
import SevenSegment from '../circuit/components/SevenSegment'
import Relay from '../circuit/components/Relay'
import Motor from '../circuit/components/Motor'
import type { ComponentePlano, CablePlano, NodoPlano, BateriaPlano, EstadoItem } from '../circuit/types'

// ---- Revelado progresivo (issue #23) ----
// previo = ya colocado (atenuado) · activo = paso actual (resaltado) · normal = sin efecto.
const OPACIDAD_PREVIO = 0.35
const ACCENT_FALLBACK = '#A855F7' // por si el CSS var aún no resolvió (primer frame)

function opacidadDe(estado?: EstadoItem): number {
  return estado === 'previo' ? OPACIDAD_PREVIO : 1
}

// Anillo sobre un hueco: señala dónde va el componente del paso activo.
// El color viene del tema (día/noche) — ver `acento` en Protoboard, resuelto
// desde la variable CSS --accent porque Konva/canvas no entiende var(...).
function MarcadorActivo({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <Circle
      x={x} y={y} radius={9}
      stroke={color} strokeWidth={2.5}
      shadowColor={color} shadowBlur={10} shadowOpacity={0.9}
      listening={false} perfectDrawEnabled={false}
    />
  )
}

// ============================================================
//  ORIENTACIÓN: los dibujos del catálogo están hechos en
//  horizontal (asumen y1 === y2). Este wrapper los lleva a un
//  marco local horizontal y rota el grupo entero, para que un
//  componente colocado en vertical/diagonal se vea EXACTAMENTE
//  igual que en la Biblioteca (cuerpo, bandas, gradientes).
// ============================================================
function ComponenteOrientado({ comp, children }: {
  comp: ComponentePlano
  children: (local: ComponentePlano) => ReactNode
}) {
  const cx = (comp.x1 + comp.x2) / 2
  const cy = (comp.y1 + comp.y2) / 2
  const dx = comp.x2 - comp.x1
  const dy = comp.y2 - comp.y1
  const d = Math.hypot(dx, dy)
  const rad = Math.atan2(dy, dx)

  // Pasa un punto del lienzo al marco local (rotado −ángulo, centrado en 0,0).
  const aLocal = (px: number, py: number) => {
    const rx = px - cx
    const ry = py - cy
    return {
      x: rx * Math.cos(-rad) - ry * Math.sin(-rad),
      y: rx * Math.sin(-rad) + ry * Math.cos(-rad),
    }
  }

  const local: ComponentePlano = { ...comp, x1: -d / 2, y1: 0, x2: d / 2, y2: 0 }
  if (comp.x3 !== undefined && comp.y3 !== undefined) {
    const p3 = aLocal(comp.x3, comp.y3)
    local.x3 = p3.x
    local.y3 = p3.y
  }

  return (
    <Group x={cx} y={cy} rotation={(rad * 180) / Math.PI}>
      {children(local)}
    </Group>
  )
}

// Batería FÍSICA dibujada en el gutter izquierdo, con cables a los rieles.
// (La fuente del netlist no ocupa un hueco: energiza los rieles + y −.)
function BatteryEdge({ bateria, index }: { bateria: BateriaPlano; index: number }) {
  const cx = 34
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
  photoresistor: Photoresistor,
  buzzer: Buzzer,
  voltmeter: Voltmeter,
  crystal: Crystal,
  relay: Relay,
  motor: Motor,
  generic: Generic,
}

// ============================================================
//  BASE REALISTA de la protoboard (como una física de verdad):
//  plástico blanco en 3 tiras separadas, huecos CUADRADOS oscuros,
//  canal central rebajado, rieles con línea roja/azul y signos.
//  Las coordenadas de los huecos NO cambian (grid.ts manda).
// ============================================================

// Bordes horizontales del cuerpo plástico.
const BX0 = 58
const bx1 = () => railHoleX(COLS) + 36

// Un hueco cuadrado oscuro (como los contactos reales).
function Hueco({ x, y }: { x: number; y: number }) {
  return (
    <Rect
      x={x - 3.5} y={y - 3.5} width={7} height={7} cornerRadius={1.2}
      fill="#2b2b30" stroke="#17171a" strokeWidth={0.7}
      listening={false} perfectDrawEnabled={false}
    />
  )
}

// Una tira de plástico blanco (gradiente sutil + sombra de apoyo).
function TiraPlastico({ y0, y1 }: { y0: number; y1: number }) {
  return (
    <Rect
      x={BX0} y={y0} width={bx1() - BX0} height={y1 - y0} cornerRadius={7}
      fillLinearGradientStartPoint={{ x: 0, y: 0 }}
      fillLinearGradientEndPoint={{ x: 0, y: y1 - y0 }}
      fillLinearGradientColorStops={[0, '#fefefc', 0.5, '#f4f2ec', 1, '#e8e6df']}
      stroke="#d6d4cc" strokeWidth={1}
      shadowColor="black" shadowBlur={10} shadowOpacity={0.18} shadowOffset={{ x: 0, y: 4 }}
      listening={false} perfectDrawEnabled={false}
    />
  )
}

// Un riel de poder realista: línea de color + fila de huecos + signos.
function PowerRail({ y, color, sign, lineOffset }: { y: number; color: string; sign: string; lineOffset: number }) {
  const xIni = railHoleX(1) - 12
  const xFin = railHoleX(COLS) + 12
  return (
    <>
      <Line points={[xIni, y + lineOffset, xFin, y + lineOffset]} stroke={color} strokeWidth={2.5} listening={false} perfectDrawEnabled={false} />
      <Text x={BX0 + 8} y={y - 8} text={sign} fontSize={16} fill={color} fontStyle="bold" listening={false} />
      <Text x={bx1() - 22} y={y - 8} text={sign} fontSize={16} fill={color} fontStyle="bold" listening={false} />
      {Array.from({ length: COLS }).map((_, c) => (
        <Hueco key={`rail-${sign}-${y}-${c}`} x={railHoleX(c + 1)} y={y} />
      ))}
    </>
  )
}

type Props = {
  componentes?: ComponentePlano[]
  cables?: CablePlano[]
  nodos?: NodoPlano[]
  baterias?: BateriaPlano[]
  // Factor de escala para encajar el tablero en su contenedor (1 = tamaño natural).
  escala?: number
}

// Zoom nativo de Konva (independiente del zoom del navegador): rueda del
// mouse hace zoom centrado en el cursor, y arrastrar el fondo hace pan.
// El Stage llena TODO el contenedor (no solo el tamaño del tablero) para que
// al hacer zoom haya espacio de sobra antes de recortar el borde del board.
const ZOOM_MIN = 0.5
const ZOOM_MAX = 4
const ZOOM_STEP = 1.4

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

function Protoboard({ componentes = [], cables = [], nodos = [], baterias = [], escala = 1 }: Props) {
  const { width, height } = boardSize()
  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [stageSize, setStageSize] = useState({ width: width * escala, height: height * escala })
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [acento, setAcento] = useState(ACCENT_FALLBACK)
  const escalaEfectiva = escala * zoom
  // Tooltip al pasar el mouse sobre un componente: qué es, sin tener que
  // adivinarlo por su dibujo. x/y son la posición del puntero relativa al
  // contenedor (lo que ya da getPointerPosition — no hace falta deshacer el
  // pan/zoom del Stage, porque el puntero ya viene en pixeles de pantalla).
  const [hover, setHover] = useState<{ label: string; x: number; y: number } | null>(null)

  function entrarComponente(e: Konva.KonvaEventObject<MouseEvent>, label: string) {
    const stage = e.target.getStage()
    const pointer = stage?.getPointerPosition()
    if (stage) stage.container().style.cursor = 'pointer'
    if (pointer) setHover({ label, x: pointer.x, y: pointer.y })
  }

  function moverEnComponente(e: Konva.KonvaEventObject<MouseEvent>, label: string) {
    const pointer = e.target.getStage()?.getPointerPosition()
    if (pointer) setHover({ label, x: pointer.x, y: pointer.y })
  }

  function salirComponente(e: Konva.KonvaEventObject<MouseEvent>) {
    const stage = e.target.getStage()
    if (stage) stage.container().style.cursor = 'default'
    setHover(null)
  }

  // Resuelve el color de acento del TEMA ACTIVO (día/noche) desde la
  // variable CSS --accent. Konva dibuja en <canvas>, que no entiende
  // "var(--accent)" como valor de color — hay que leer el valor calculado
  // de un elemento del DOM (que sí cae dentro del data-theme del provider).
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const valor = getComputedStyle(el).getPropertyValue('--accent').trim()
    if (valor) setAcento(valor)
  }, [])

  // El Stage mide el contenedor completo (no el tablero) — así el zoom tiene
  // margen real antes de tocar el borde del canvas.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ajustar = () => setStageSize({ width: el.clientWidth, height: el.clientHeight })
    ajustar()
    const ro = new ResizeObserver(ajustar)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Si cambia el ajuste automático o el tamaño del contenedor (ej. al
  // redimensionar el chat), se resetea el zoom manual y se recentra el board.
  useEffect(() => {
    setZoom(1)
    setPos({ x: (stageSize.width - width * escala) / 2, y: (stageSize.height - height * escala) / 2 })
  }, [escala, stageSize.width, stageSize.height, width, height])

  // Aplica un factor de zoom manteniendo fijo el punto (centro del viewport
  // por defecto, o el cursor cuando viene de la rueda del mouse).
  function zoomHacia(factor: number, centro?: { x: number; y: number }) {
    const c = centro ?? { x: stageSize.width / 2, y: stageSize.height / 2 }
    const puntoLogico = { x: (c.x - pos.x) / escalaEfectiva, y: (c.y - pos.y) / escalaEfectiva }
    const nuevoZoom = clamp(zoom * factor, ZOOM_MIN, ZOOM_MAX)
    const nuevaEscala = escala * nuevoZoom
    setZoom(nuevoZoom)
    setPos({ x: c.x - puntoLogico.x * nuevaEscala, y: c.y - puntoLogico.y * nuevaEscala })
  }

  function onWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault()
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return
    // Sensibilidad más alta (antes se sentía muy lento con mouse/trackpad estándar).
    const factor = Math.exp(-e.evt.deltaY * 0.004)
    zoomHacia(factor, pointer)
  }

  function resetVista() {
    setZoom(1)
    setPos({ x: (stageSize.width - width * escala) / 2, y: (stageSize.height - height * escala) / 2 })
  }

  const botonZoomStyle = { background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--ink-soft)' }

  // Límites verticales de las 3 tiras (derivados del grid, no mágicos).
  const tiraTop = { y0: 6, y1: TOP_MINUS_Y + 14 }
  const tiraMain = { y0: TOP_MINUS_Y + 18, y1: rowY(ROWS.length - 1) + 12 }
  const tiraBot = { y0: bottomPlusY() - 16, y1: bottomMinusY() + 14 }

  // Canal central rebajado (entre las filas E y F).
  const canalY0 = rowY(4) + 12
  const canalY1 = rowY(5) - 12

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
    <Stage
      ref={stageRef}
      width={stageSize.width} height={stageSize.height}
      scaleX={escalaEfectiva} scaleY={escalaEfectiva}
      x={pos.x} y={pos.y}
      draggable
      onDragEnd={(e) => setPos({ x: e.target.x(), y: e.target.y() })}
      onWheel={onWheel}
    >
      {/* CAPA 1: la protoboard (fija, no interactiva) */}
      <Layer listening={false}>
        {/* Cuerpo plástico en 3 tiras (riel superior · bloque central · riel inferior) */}
        <TiraPlastico y0={tiraTop.y0} y1={tiraTop.y1} />
        <TiraPlastico y0={tiraMain.y0} y1={tiraMain.y1} />
        <TiraPlastico y0={tiraBot.y0} y1={tiraBot.y1} />

        {/* Canal central rebajado (donde se montan los ICs) */}
        <Rect
          x={BX0 + 2} y={canalY0} width={bx1() - BX0 - 4} height={canalY1 - canalY0}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: 0, y: canalY1 - canalY0 }}
          fillLinearGradientColorStops={[0, '#d8d6cf', 0.15, '#e6e4dd', 0.85, '#e6e4dd', 1, '#f6f4ee']}
          listening={false} perfectDrawEnabled={false}
        />
        <Line points={[BX0 + 2, canalY0, bx1() - 2, canalY0]} stroke="#c3c1b9" strokeWidth={1} listening={false} perfectDrawEnabled={false} />
        <Line points={[BX0 + 2, canalY1, bx1() - 2, canalY1]} stroke="#ffffff" strokeWidth={1} listening={false} perfectDrawEnabled={false} />

        {/* Rieles superiores: + (línea roja arriba) y − (línea azul abajo) */}
        <PowerRail y={TOP_PLUS_Y} color="#dc2626" sign="+" lineOffset={-11} />
        <PowerRail y={TOP_MINUS_Y} color="#2563eb" sign="−" lineOffset={11} />

        {/* Números de columna */}
        {Array.from({ length: COLS }).map((_, c) => (
          <Text key={`col-${c}`} x={MARGIN_X + c * SPACING - 5} y={MARGIN_Y - 19} width={10} align="center" text={`${c + 1}`} fontSize={8.5} fill="#8d8b83" listening={false} />
        ))}

        {/* Letras de fila (a ambos lados, como en una protoboard real) */}
        {ROWS.map((label, r) => (
          <Fragment key={`row-${label}`}>
            <Text x={BX0 + 12} y={rowY(r) - 5} text={label} fontSize={10} fill="#8d8b83" listening={false} />
            <Text x={railHoleX(COLS) + 18} y={rowY(r) - 5} text={label} fontSize={10} fill="#8d8b83" listening={false} />
          </Fragment>
        ))}

        {/* Huecos de la matriz principal (cuadrados oscuros) */}
        {ROWS.map((label, r) =>
          Array.from({ length: COLS }).map((_, c) => (
            <Hueco key={`${label}-${c}`} x={MARGIN_X + c * SPACING} y={rowY(r)} />
          )),
        )}

        {/* Rieles inferiores */}
        <PowerRail y={bottomPlusY()} color="#dc2626" sign="+" lineOffset={-11} />
        <PowerRail y={bottomMinusY()} color="#2563eb" sign="−" lineOffset={11} />
      </Layer>

      {/* CAPA 2: los componentes del circuito + sus cables */}
      <Layer>
        {/* Baterías físicas al borde (energizan los rieles) */}
        {baterias.map((bat, i) => (
          <Group key={`bat-${bat.id}`} opacity={opacidadDe(bat.estado)}>
            <BatteryEdge bateria={bat} index={i} />
          </Group>
        ))}

        {/* Cables (van debajo de los componentes) */}
        {cables.map((cable, i) => (
          <Group key={`cable-${i}`} opacity={opacidadDe(cable.estado)}>
            {cable.estado === 'activo' && (
              <>
                <MarcadorActivo x={cable.x1} y={cable.y1} color={acento} />
                <MarcadorActivo x={cable.x2} y={cable.y2} color={acento} />
              </>
            )}
            <Wire x1={cable.x1} y1={cable.y1} x2={cable.x2} y2={cable.y2} color={cable.color ?? '#16a34a'} />
          </Group>
        ))}

        {/* Nodos (V_in, V_out, GND...): terminal de color + etiqueta */}
        {nodos.map((nodo) => (
          <Fragment key={`nodo-${nodo.label}`}>
            <Circle x={nodo.x} y={nodo.y} radius={6} fill={nodo.color} stroke="#1e293b" />
            <Text x={nodo.x - nodo.label.length * 3} y={nodo.y - 20} text={nodo.label} fontSize={10} fill={nodo.color} fontStyle="bold" />
          </Fragment>
        ))}

        {/* Componentes: dibujo del catálogo, orientado según sus pines
            (ComponenteOrientado los rota para que se vean como en la Biblioteca) */}
        {componentes.map((comp) => {
          return (
            <Group
              key={comp.id}
              opacity={opacidadDe(comp.estado)}
              onMouseEnter={(e) => entrarComponente(e, comp.label)}
              onMouseMove={(e) => moverEnComponente(e, comp.label)}
              onMouseLeave={salirComponente}
            >
              {comp.kind === 'ic' ? (
                // El IC no usa el patrón de patas: se dibuja como caja con pines.
                <IC x={Math.min(comp.x1, comp.x2)} y={Math.min(comp.y1, comp.y2) - 18} width={Math.abs(comp.x2 - comp.x1) || 60} label={comp.id} />
              ) : (
                <ComponenteOrientado comp={comp}>
                  {(local) =>
                    local.kind === 'resistor' ? (
                      // El resistor recibe datos crudos: calcula sus propias bandas de color.
                      <Resistor
                        x1={local.x1} y1={local.y1} x2={local.x2} y2={local.y2}
                        valor={local.valor} tolerancia={local.tolerancia} potenciaNominal={local.potenciaNominal}
                      />
                    ) : local.kind === 'transistor' ? (
                      // El transistor tiene una 3ra pata (base) — patrón distinto a los demás.
                      <Transistor x1={local.x1} y1={local.y1} x2={local.x2} y2={local.y2} x3={local.x3} y3={local.y3} />
                    ) : local.kind === 'potentiometer' ? (
                      <Potentiometer x1={local.x1} y1={local.y1} x2={local.x2} y2={local.y2} x3={local.x3} y3={local.y3} />
                    ) : local.kind === 'regulator' ? (
                      // Regulador TO-220: 3 patas (Vin, GND centro, Vout).
                      <VoltageRegulator x1={local.x1} y1={local.y1} x2={local.x2} y2={local.y2} x3={local.x3} y3={local.y3} label={local.valor} />
                    ) : local.kind === 'sevenseg' ? (
                      <SevenSegment x1={local.x1} y1={local.y1} x2={local.x2} y2={local.y2} />
                    ) : local.kind === 'electrolytic' ? (
                      <ElectrolyticCapacitor x1={local.x1} y1={local.y1} x2={local.x2} y2={local.y2} valor={local.valor} />
                    ) : (
                      (() => {
                        const Dibujo = CATALOGO[local.kind as keyof typeof CATALOGO]
                        return <Dibujo x1={local.x1} y1={local.y1} x2={local.x2} y2={local.y2} />
                      })()
                    )
                  }
                </ComponenteOrientado>
              )}
              {/* Sin etiqueta flotante sobre el componente (issue: se solapaba
                  con las bandas del resistor) — el id/valor ya se muestra en
                  la Instrucción y en el panel "Componentes". */}
              {/* Paso activo: anillos en los huecos donde van las patas —
                  se dibujan DESPUÉS del componente (encima) para que nunca
                  queden tapados por su cuerpo (ej. la pata del medio de un
                  transistor/potenciómetro/regulador, justo bajo el cuerpo). */}
              {comp.estado === 'activo' && (
                <>
                  <MarcadorActivo x={comp.x1} y={comp.y1} color={acento} />
                  <MarcadorActivo x={comp.x2} y={comp.y2} color={acento} />
                  {comp.x3 !== undefined && comp.y3 !== undefined && <MarcadorActivo x={comp.x3} y={comp.y3} color={acento} />}
                </>
              )}
            </Group>
          )
        })}
      </Layer>
    </Stage>
    {/* Tooltip del componente bajo el mouse — HTML encima del canvas (no
        Konva.Text) para que se vea nítido y no se deforme con el zoom del
        Stage. pointer-events-none: si no, robaría el hover al propio canvas
        y el onMouseLeave del Group nunca se dispararía. */}
    {hover && (
      <div
        className="absolute z-20 pointer-events-none px-2 py-1 rounded-lg text-xs font-semibold shadow-lg whitespace-nowrap"
        style={{
          left: hover.x + 14,
          top: hover.y + 14,
          background: 'var(--accent)',
          color: 'var(--bg2)',
        }}
      >
        {hover.label}
      </div>
    )}
    {/* Controles de zoom nativo de Konva (no el zoom del navegador) */}
    <div className="absolute bottom-2 right-2 flex flex-col gap-1 z-10">
      <button onClick={() => zoomHacia(ZOOM_STEP)} className="grid place-items-center w-7 h-7 rounded-md shadow" style={botonZoomStyle} title="Acercar">
        <ZoomIn size={14} />
      </button>
      <button onClick={() => zoomHacia(1 / ZOOM_STEP)} className="grid place-items-center w-7 h-7 rounded-md shadow" style={botonZoomStyle} title="Alejar">
        <ZoomOut size={14} />
      </button>
      <button onClick={resetVista} className="grid place-items-center w-7 h-7 rounded-md shadow" style={botonZoomStyle} title="Restablecer vista">
        <RotateCcw size={14} />
      </button>
    </div>
    </div>
  )
}

export default Protoboard

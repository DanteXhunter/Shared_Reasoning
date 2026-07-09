import { Stage, Layer, Group } from 'react-konva'
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
import Wire from '../circuit/components/Wire'
import type { ComponentePlano } from '../circuit/types'

// Mismas coordenadas de pines que usa la Biblioteca (ComponentGallery) —
// los dibujos son EXACTAMENTE los mismos, a la misma escala relativa.
const CY = 62
const X1 = 45
const X2 = 165
const dosPatas = { x1: X1, y1: CY, x2: X2, y2: CY }
const tresPatas = { x1: 65, y1: 82, x2: 145, y2: 82, x3: 105, y3: 82 }
const CENTRO_X = (X1 + X2) / 2 // 105 — también coincide con el centro de tresPatas

// El "viewport" visible es más chico que el lienzo completo del dibujo:
// como un Stage de Konva recorta todo lo que quede fuera de su tamaño,
// esto oculta las patas/conectores largos y deja ver solo el cuerpo del
// componente, sin necesidad de tocar cada dibujo del catálogo.
const VIEW_W = 92
const VIEW_H = 62
const OFFSET_X = CENTRO_X - VIEW_W / 2
const OFFSET_Y = CY - VIEW_H / 2
// El display de 7 segmentos usa dosPatas (patas a y=62) pero su cuerpo se
// dibuja mucho más arriba que un componente de 2 patas típico (bodyH=38 +
// separación), así que con el recorte genérico el módulo quedaba cortado
// por arriba. Se centra el recorte en su propio contenido (body y≈14..62).
const OFFSET_Y_SEVENSEG = 7

const CATALOGO = {
  led: LED,
  diode: Diode,
  capacitor: Capacitor,
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

type Props = { kind: ComponentePlano['kind']; valor?: string; tolerancia?: string }

// Miniatura con el dibujo REAL del catálogo (el mismo que la Biblioteca),
// pero recortada al cuerpo del componente — sin las patas largas — y a un
// tamaño más grande para que se distinga bien en las tarjetas del panel.
// El fondo lo pone el contenedor HTML padre (respeta el tema día/noche);
// el Stage de Konva queda transparente.
function MiniComponente({ kind, valor, tolerancia }: Props) {
  const offsetY = kind === 'sevenseg' ? OFFSET_Y_SEVENSEG : OFFSET_Y
  return (
    <Stage width={VIEW_W} height={VIEW_H}>
      <Layer listening={false}>
        <Group x={-OFFSET_X} y={-offsetY}>
          {kind === 'resistor' ? (
            <Resistor {...dosPatas} valor={valor} tolerancia={tolerancia} />
          ) : kind === 'transistor' ? (
            <Transistor {...tresPatas} />
          ) : kind === 'potentiometer' ? (
            <Potentiometer {...tresPatas} />
          ) : kind === 'regulator' ? (
            <VoltageRegulator {...tresPatas} label={valor} />
          ) : kind === 'sevenseg' ? (
            <SevenSegment {...dosPatas} />
          ) : kind === 'electrolytic' ? (
            <ElectrolyticCapacitor {...dosPatas} valor={valor} />
          ) : kind === 'ic' ? (
            <IC x={CENTRO_X - 50} y={32} width={100} pins={8} label={valor ?? ''} />
          ) : (
            (() => {
              const Dibujo = CATALOGO[kind as keyof typeof CATALOGO] ?? Generic
              return <Dibujo {...dosPatas} />
            })()
          )}
        </Group>
      </Layer>
    </Stage>
  )
}

// Miniatura del JUMPER — un cable también es un componente (§7.B): el
// color importa (rojo=+/VCC, negro=GND, el resto es libre) y en el paso de
// "conectar_cable" el usuario necesita ver qué color de cable tomar.
function MiniCable({ color }: { color: string }) {
  return (
    <Stage width={VIEW_W} height={VIEW_H}>
      <Layer listening={false}>
        <Wire x1={20} y1={VIEW_H / 2 + 6} x2={VIEW_W - 20} y2={VIEW_H / 2 + 6} color={color} />
      </Layer>
    </Stage>
  )
}

export { MiniCable }
export default MiniComponente

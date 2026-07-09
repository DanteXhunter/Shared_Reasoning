import { useState } from 'react'
import { Stage, Layer, Rect } from 'react-konva'
import type { ReactNode } from 'react'

import MiniComponente from './MiniComponente'
import { normalizarTipo } from '../circuit/layout'
import type { Componente } from '../circuit/types'
import Resistor from '../circuit/components/Resistor'
import { calcularBandas, parseOhmios } from '../circuit/resistorColorCode'
import LED from '../circuit/components/LED'
import Diode from '../circuit/components/Diode'
import Transistor from '../circuit/components/Transistor'
import Capacitor from '../circuit/components/Capacitor'
import ElectrolyticCapacitor from '../circuit/components/ElectrolyticCapacitor'
import Inductor from '../circuit/components/Inductor'
import Fuse from '../circuit/components/Fuse'
import Potentiometer from '../circuit/components/Potentiometer'
import PushButton from '../circuit/components/PushButton'
import Source from '../circuit/components/Source'
import Switch from '../circuit/components/Switch'
import Bulb from '../circuit/components/Bulb'
import IC from '../circuit/components/IC'
import Wire from '../circuit/components/Wire'
import Generic from '../circuit/components/Generic'
import Photoresistor from '../circuit/components/Photoresistor'
import Buzzer from '../circuit/components/Buzzer'
import VoltageRegulator from '../circuit/components/VoltageRegulator'
import Crystal from '../circuit/components/Crystal'
import SevenSegment from '../circuit/components/SevenSegment'
import Relay from '../circuit/components/Relay'
import Motor from '../circuit/components/Motor'

// Galería que renderiza TODOS los componentes del catálogo en un solo lugar.
// Sirve como referencia visual y como banco de pruebas rápido de cada dibujo.
// Respeta el tema día/noche del resto de la UI vía variables CSS (--bg1,
// --bg2, --ink, --ink-soft, --border, --accent — ver ui/theme.tsx).

const W = 210
const H = 110
const CY = 62 // línea central donde van las patas de los componentes de 2 patas
const X1 = 45
const X2 = 165

// Coordenadas estándar de "2 patas" para la mayoría de componentes.
const dosPatas = { x1: X1, y1: CY, x2: X2, y2: CY }
// Coordenadas de "3 patas" (patas abajo, cuerpo arriba).
const tresPatas = { x1: 65, y1: 82, x2: 145, y2: 82, x3: 105, y3: 82 }

type ItemProps = { nombre: string; sub?: string; children: ReactNode }

// Hueco reservado para la descripción "de qué hace" cada componente.
// Cascarón por ahora: el texto lo iremos poniendo después (dictado del usuario).
function HuecoDescripcion() {
  return (
    <div
      className="mt-2 w-full rounded-md"
      style={{ minHeight: 30, border: '1px dashed var(--border)' }}
    />
  )
}

function Celda({ nombre, sub, children }: ItemProps) {
  return (
    <div
      className="rounded-xl p-2 flex flex-col items-center shadow-sm"
      style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
    >
      <Stage width={W} height={H}>
        <Layer>
          {/* fondo tipo protoboard para contexto — neutro en ambos temas */}
          <Rect x={0} y={0} width={W} height={H} cornerRadius={8} fill="#e7e5e0" />
          {children}
        </Layer>
      </Stage>
      <p className="mt-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>{nombre}</p>
      {sub && <p className="text-[10px]" style={{ color: 'var(--ink-soft)' }}>{sub}</p>}
      <HuecoDescripcion />
    </div>
  )
}

// Una tarjeta del desglose "paso a paso" de los componentes de ESTA sesión.
// Dibujo real (mismo del catálogo) + identidad del componente + hueco de descripción.
function TarjetaSesion({ numero, componente }: { numero: number; componente: Componente }) {
  const kind = normalizarTipo(componente.tipo)
  return (
    <div
      className="rounded-xl p-3 flex items-start gap-3 shadow-sm"
      style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
    >
      <span
        className="shrink-0 grid place-items-center w-6 h-6 rounded-full text-xs font-semibold"
        style={{ background: 'var(--accent)', color: 'var(--bg2)' }}
      >
        {numero}
      </span>
      <div className="shrink-0 rounded-lg p-1" style={{ background: 'var(--bg1)' }}>
        <MiniComponente kind={kind} valor={componente.valor} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
          {componente.id}{componente.valor ? ` · ${componente.valor}${componente.unidad ? ` ${componente.unidad}` : ''}` : ''}
        </p>
        <p className="text-[11px] capitalize" style={{ color: 'var(--ink-soft)' }}>{componente.tipo}</p>
        <HuecoDescripcion />
      </div>
    </div>
  )
}

// Formatea ohmios a texto legible (1000 → "1 kΩ").
function formatOhm(ohm: number): string {
  if (!isFinite(ohm)) return 'valor no válido'
  if (ohm >= 1e6) return `${+(ohm / 1e6).toFixed(2)} MΩ`
  if (ohm >= 1e3) return `${+(ohm / 1e3).toFixed(2)} kΩ`
  return `${+ohm.toFixed(2)} Ω`
}

// Laboratorio del resistor: UNA plantilla, editas valor/tolerancia y ves
// las bandas cambiar en vivo. Demuestra que no se dibuja cada resistencia.
function ResistorPlayground() {
  const [valor, setValor] = useState('10k')
  const [tolerancia, setTolerancia] = useState('5')
  const [abierto, setAbierto] = useState(false)

  const ohmios = parseOhmios(valor)
  const bandas = calcularBandas(valor, tolerancia)
  const nombres = bandas.map((b) => b.nombre)

  const tolerancias = [
    { v: '10', l: '±10% (plata)' }, { v: '5', l: '±5% (dorado)' },
    { v: '2', l: '±2% (rojo)' }, { v: '1', l: '±1% (marrón)' },
    { v: '0.5', l: '±0.5% (verde)' }, { v: '0.25', l: '±0.25% (azul)' },
  ]

  return (
    <div className="rounded-xl p-4 mb-6 shadow-sm" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
          Resistor — <b style={{ color: 'var(--ink)' }}>una sola plantilla</b>. Cambia el valor o la tolerancia y las bandas se recalculan solas.
        </p>
        <button
          onClick={() => setAbierto((a) => !a)}
          className="text-xs px-3 py-1.5 rounded-lg transition hover:opacity-90"
          style={{ background: 'var(--accent)', color: 'var(--bg2)' }}
        >
          {abierto ? '✕ Cerrar editor' : '✏️ Abrir editor'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        {/* El dibujo en vivo */}
        <div className="flex flex-col items-center">
          <Stage width={240} height={120}>
            <Layer>
              <Rect x={0} y={0} width={240} height={120} cornerRadius={8} fill="#e7e5e0" />
              <Resistor x1={45} y1={62} x2={195} y2={62} valor={valor} tolerancia={tolerancia} />
            </Layer>
          </Stage>
          <p className="mt-1 text-lg font-bold" style={{ color: 'var(--accent)' }}>{formatOhm(ohmios)}</p>
          <p className="text-[11px] text-center" style={{ color: 'var(--ink-soft)' }}>
            {bandas.length} bandas · {nombres.join(' · ')}
          </p>
        </div>

        {/* Editor (se abre/cierra) */}
        {abierto && (
          <div className="flex flex-col gap-3 min-w-[220px]">
            <label className="text-xs" style={{ color: 'var(--ink-soft)' }}>
              Valor (ej. 10k, 4k7, 220, 1M)
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="mt-1 w-full outline-none rounded-lg px-3 py-1.5 text-sm"
                style={{ background: 'var(--bg1)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
            </label>
            <label className="text-xs" style={{ color: 'var(--ink-soft)' }}>
              Tolerancia
              <select
                value={tolerancia}
                onChange={(e) => setTolerancia(e.target.value)}
                className="mt-1 w-full rounded-lg px-3 py-1.5 text-sm"
                style={{ background: 'var(--bg1)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              >
                {tolerancias.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-1">
              {['1', '220', '4k7', '10k', '470k', '1M', '4k75'].map((v) => (
                <button
                  key={v} onClick={() => setValor(v)}
                  className="text-[11px] px-2 py-1 rounded transition hover:opacity-80"
                  style={{ background: 'var(--bg1)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ComponentGallery({ componentesSesion = [] }: { componentesSesion?: Componente[] }) {
  return (
    <div>
      {/* ───────────────── SECCIÓN A — Componentes de ESTA sesión ───────────────── */}
      <section className="mb-8">
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--ink-soft)' }}>
          Componentes de esta sesión
        </p>
        {componentesSesion.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {componentesSesion.map((c, i) => (
              <TarjetaSesion key={`${c.id}-${i}`} numero={i + 1} componente={c} />
            ))}
          </div>
        ) : (
          <div
            className="rounded-xl p-6 text-center text-xs"
            style={{ background: 'var(--bg1)', border: '1px dashed var(--border)', color: 'var(--ink-soft)' }}
          >
            Aún no hay componentes en esta sesión.
          </div>
        )}
      </section>

      {/* ───────────────── SECCIÓN B — Biblioteca completa ───────────────── */}
      <section>
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--ink-soft)' }}>
          Biblioteca completa
        </p>

        <ResistorPlayground />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <Celda nombre="LED" sub="diodo emisor"><LED {...dosPatas} /></Celda>
      <Celda nombre="Diodo" sub="rectificador"><Diode {...dosPatas} /></Celda>
      <Celda nombre="Transistor" sub="BJT · TO-92"><Transistor {...tresPatas} /></Celda>

      <Celda nombre="Capacitor" sub="cerámico"><Capacitor {...dosPatas} /></Celda>
      <Celda nombre="Cap. electrolítico" sub="polarizado"><ElectrolyticCapacitor {...dosPatas} valor="100µF" /></Celda>
      <Celda nombre="Inductor" sub="bobina"><Inductor {...dosPatas} /></Celda>

      <Celda nombre="Fusible" sub="protección"><Fuse {...dosPatas} /></Celda>
      <Celda nombre="Potenciómetro" sub="resistencia variable"><Potentiometer {...tresPatas} /></Celda>
      <Celda nombre="Botón" sub="pulsador momentáneo"><PushButton {...dosPatas} /></Celda>

      <Celda nombre="Batería" sub="física · pila real"><Source {...dosPatas} valor="9V" /></Celda>
      <Celda nombre="Interruptor" sub="slide switch físico"><Switch {...dosPatas} /></Celda>
      <Celda nombre="Bombilla" sub="incandescente física"><Bulb {...dosPatas} /></Celda>

      <Celda nombre="Circuito integrado" sub="DIP · ej. NE555"><IC x={55} y={32} width={100} pins={8} label="NE555" /></Celda>
      <Celda nombre="Cable" sub="jumper Dupont"><Wire {...dosPatas} color="#dc2626" /></Celda>
      <Celda nombre="Fotorresistor" sub="LDR · sensor de luz"><Photoresistor {...dosPatas} /></Celda>

      <Celda nombre="Buzzer" sub="zumbador piezo"><Buzzer {...dosPatas} /></Celda>
      <Celda nombre="Regulador" sub="TO-220 · 7805"><VoltageRegulator {...tresPatas} label="7805" /></Celda>
      <Celda nombre="Cristal" sub="oscilador HC-49"><Crystal {...dosPatas} /></Celda>

      <Celda nombre="Display 7 seg." sub="1 dígito"><SevenSegment {...dosPatas} /></Celda>
      <Celda nombre="Relé" sub="SPDT"><Relay {...dosPatas} /></Celda>
      <Celda nombre="Motor DC" sub="hobby"><Motor {...dosPatas} /></Celda>

      <Celda nombre="Genérico" sub="fallback"><Generic {...dosPatas} /></Celda>
        </div>
      </section>
    </div>
  )
}

export default ComponentGallery

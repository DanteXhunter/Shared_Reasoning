import { useState } from 'react'
import { Stage, Layer, Rect } from 'react-konva'
import type { ReactNode } from 'react'

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

// Galería que renderiza TODOS los componentes del catálogo en un solo lugar.
// Sirve como referencia visual y como banco de pruebas rápido de cada dibujo.

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

function Celda({ nombre, sub, children }: ItemProps) {
  return (
    <div className="glass border border-white/10 rounded-xl p-2 flex flex-col items-center shadow-lg shadow-black/20">
      <Stage width={W} height={H}>
        <Layer>
          {/* fondo tipo protoboard para contexto */}
          <Rect x={0} y={0} width={W} height={H} cornerRadius={8} fill="#e7e5e0" />
          {children}
        </Layer>
      </Stage>
      <p className="mt-1 text-sm font-medium text-slate-200">{nombre}</p>
      {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
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
    <div className="glass border border-white/10 rounded-xl p-4 mb-6 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-400">
          Resistor — <b>una sola plantilla</b>. Cambia el valor o la tolerancia y las bandas se recalculan solas.
        </p>
        <button
          onClick={() => setAbierto((a) => !a)}
          className="text-xs px-3 py-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-600 transition"
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
          <p className="mt-1 text-lg font-bold text-violet-300">{formatOhm(ohmios)}</p>
          <p className="text-[11px] text-slate-400 text-center">
            {bandas.length} bandas · {nombres.join(' · ')}
          </p>
        </div>

        {/* Editor (se abre/cierra) */}
        {abierto && (
          <div className="flex flex-col gap-3 min-w-[220px]">
            <label className="text-xs text-slate-400">
              Valor (ej. 10k, 4k7, 220, 1M)
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="mt-1 w-full bg-slate-800/70 border border-white/10 focus:border-violet-400/50 outline-none rounded-lg px-3 py-1.5 text-sm text-slate-100"
              />
            </label>
            <label className="text-xs text-slate-400">
              Tolerancia
              <select
                value={tolerancia}
                onChange={(e) => setTolerancia(e.target.value)}
                className="mt-1 w-full bg-slate-800/70 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-100"
              >
                {tolerancias.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-1">
              {['1', '220', '4k7', '10k', '470k', '1M', '4k75'].map((v) => (
                <button key={v} onClick={() => setValor(v)}
                  className="text-[11px] px-2 py-1 rounded bg-slate-700/60 hover:bg-slate-600 transition">
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

function ComponentGallery() {
  return (
    <div>
      <ResistorPlayground />

      <p className="text-xs text-slate-400 mb-2">Resto del catálogo:</p>
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
      <Celda nombre="Cable" sub="jumper"><Wire {...dosPatas} color="#dc2626" /></Celda>
      <Celda nombre="Genérico" sub="fallback"><Generic {...dosPatas} /></Celda>
      </div>
    </div>
  )
}

export default ComponentGallery

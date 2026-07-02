import { useState } from 'react'
import Protoboard from './components/Protoboard'
import JsonView from './components/JsonView'
import InstruccionesView from './components/InstruccionesView'
import { analizarEsquematico } from './api/analizar'
import { planificarCircuito } from './api/planificar'
import { autoLayout, layoutDesdeInstrucciones, EJEMPLO_DIVISOR, EJEMPLO_LAMPARA, EJEMPLO_PLANNER } from './circuit/layout'
import type { Netlist, Instruccion } from './circuit/types'

// Proveedores que el agente extractor del backend soporta.
const PROVEEDORES = ['openai', 'nemotron', 'llama-vision']

function App() {
  const [imagen, setImagen] = useState<File | null>(null)
  const [proveedor, setProveedor] = useState('openai')
  const [modo, setModo] = useState('UNDER')
  const [netlist, setNetlist] = useState<Netlist | null>(null)
  const [instrucciones, setInstrucciones] = useState<Instruccion[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verJson, setVerJson] = useState(false)

  // Si hay instrucciones del planner, se usan sus coordenadas REALES.
  // Si no, se cae al auto-layout provisional del netlist.
  const { componentes, cables, nodos } = instrucciones
    ? { ...layoutDesdeInstrucciones(instrucciones), nodos: [] }
    : netlist
      ? autoLayout(netlist)
      : { componentes: [], cables: [], nodos: [] }

  async function analizar() {
    if (!imagen) return
    setCargando(true)
    setError(null)
    setNetlist(null)
    setInstrucciones(null)
    try {
      const res = await analizarEsquematico(imagen, proveedor)
      if (res.resultado) setNetlist(res.resultado)
      else setError(res.mensaje ?? 'El backend no devolvió un netlist.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setCargando(false)
    }
  }

  // PASO 2: manda el netlist al planner y renderiza las coordenadas reales.
  async function planificar() {
    if (!netlist) return
    setCargando(true)
    setError(null)
    try {
      const res = await planificarCircuito(netlist, proveedor, modo)
      if (res.instrucciones) setInstrucciones(res.instrucciones)
      else setError(res.mensaje ?? 'El planner no devolvió instrucciones.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setCargando(false)
    }
  }

  const selectClass =
    'bg-slate-800/70 border border-white/10 focus:border-violet-400/50 outline-none rounded-lg px-3 py-1.5 text-sm'
  const ejemploClass =
    'px-3 py-1.5 rounded-lg glass border border-white/10 hover:border-violet-400/40 hover:-translate-y-0.5 transition text-sm'

  return (
    <div className="min-h-screen text-slate-100 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6">
      <style>{`.glass{background:rgba(30,41,59,.55);backdrop-filter:blur(8px)}`}</style>

      {/* Encabezado */}
      <div className="flex items-center gap-3 mb-5">
        <span className="grid place-items-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-900/40 text-lg">⚡</span>
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-violet-300 to-indigo-300 bg-clip-text text-transparent">
            CircuitBuilder AI
          </h1>
          <p className="text-xs text-slate-500">Interfaz de prueba · analizar → planificar → graficar</p>
        </div>
      </div>

      {/* Controles */}
      <div className="glass border border-white/10 rounded-2xl p-4 mb-5 shadow-xl shadow-black/30">
        <div className="flex flex-wrap items-center gap-3">
          <label className="px-3 py-1.5 rounded-lg glass border border-white/10 hover:border-violet-400/40 transition text-sm cursor-pointer">
            {imagen ? `📎 ${imagen.name}` : '📎 Elegir esquemático'}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setImagen(e.target.files?.[0] ?? null)} />
          </label>

          <select value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={selectClass}>
            {PROVEEDORES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={modo} onChange={(e) => setModo(e.target.value)} className={selectClass} title="Modo de interacción">
            {['UNDER', 'OVER', 'ALONG', 'IN', 'ON'].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>

          <button
            onClick={analizar}
            disabled={!imagen || cargando}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100 transition text-sm font-medium shadow-lg shadow-violet-900/30"
          >
            {cargando ? '⏳ …' : '① Analizar'}
          </button>
          <button
            onClick={planificar}
            disabled={!netlist || cargando}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100 transition text-sm font-medium shadow-lg shadow-emerald-900/30"
          >
            {cargando ? '⏳ …' : '② Planificar (coords)'}
          </button>
        </div>

        {/* Ejemplos (sin gastar API) */}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/5">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 mr-1">Ejemplos</span>
          <button onClick={() => { setError(null); setInstrucciones(null); setNetlist(EJEMPLO_DIVISOR) }} className={ejemploClass}>Divisor</button>
          <button onClick={() => { setError(null); setInstrucciones(null); setNetlist(EJEMPLO_LAMPARA) }} className={ejemploClass}>Lámpara</button>
          <button onClick={() => { setError(null); setNetlist(null); setInstrucciones(EJEMPLO_PLANNER) }} className={`${ejemploClass} text-emerald-300`}>Planner (coords reales)</button>
        </div>
      </div>

      {error && (
        <div className="mb-5 p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-200 text-sm flex items-start gap-2">
          <span>⚠️</span><span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-5 items-start">
        {/* Protoboard */}
        <div className="glass border border-white/10 rounded-2xl p-4 overflow-auto shadow-xl shadow-black/30">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">Protoboard</span>
            {(netlist || instrucciones) && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${instrucciones ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-violet-500/15 border-violet-500/40 text-violet-300'}`}>
                {instrucciones ? 'coords del planner' : 'auto-layout provisional'}
              </span>
            )}
          </div>
          <Protoboard componentes={componentes} cables={cables} nodos={nodos} />
        </div>

        {/* JSON crudo (netlist o instrucciones del planner) */}
        {(netlist || instrucciones) && (
          <div className="glass border border-white/10 rounded-2xl p-4 w-96 shadow-xl shadow-black/30">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] uppercase tracking-widest text-slate-500">
                {instrucciones ? 'Pasos (planner)' : 'Netlist (analizar)'}
              </h2>
              {instrucciones && (
                <button
                  onClick={() => setVerJson((v) => !v)}
                  className="text-[10px] px-2 py-1 rounded-md glass border border-white/10 hover:border-violet-400/40 transition text-slate-300"
                >
                  {verJson ? '◧ Ver pasos' : '{ } Ver JSON'}
                </button>
              )}
            </div>

            <div className="max-h-[72vh] overflow-auto pr-1">
              {instrucciones && !verJson ? (
                <InstruccionesView instrucciones={instrucciones} />
              ) : (
                <JsonView data={instrucciones ?? netlist} className="rounded-lg bg-slate-950/50 p-3" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App

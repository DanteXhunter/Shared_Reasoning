import { useState } from 'react'
import Protoboard from './components/Protoboard'
import { analizarEsquematico } from './api/analizar'
import { autoLayout, EJEMPLO_DIVISOR, EJEMPLO_LAMPARA } from './circuit/layout'
import type { Netlist } from './circuit/types'

// Proveedores que el agente extractor del backend soporta.
const PROVEEDORES = ['openai', 'nemotron', 'llama-vision']

function App() {
  const [imagen, setImagen] = useState<File | null>(null)
  const [proveedor, setProveedor] = useState('openai')
  const [netlist, setNetlist] = useState<Netlist | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { componentes, cables, nodos } = netlist
    ? autoLayout(netlist)
    : { componentes: [], cables: [], nodos: [] }

  async function analizar() {
    if (!imagen) return
    setCargando(true)
    setError(null)
    setNetlist(null)
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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <h1 className="text-2xl font-bold text-violet-400 mb-4">
        CircuitBuilder AI — Interfaz de prueba
      </h1>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3 mb-4 bg-slate-800 p-4 rounded-xl">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImagen(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <select
          value={proveedor}
          onChange={(e) => setProveedor(e.target.value)}
          className="bg-slate-700 rounded px-2 py-1 text-sm"
        >
          {PROVEEDORES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button
          onClick={analizar}
          disabled={!imagen || cargando}
          className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-sm"
        >
          {cargando ? 'Analizando…' : 'Analizar esquemático'}
        </button>
        <button
          onClick={() => { setError(null); setNetlist(EJEMPLO_DIVISOR) }}
          className="px-4 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-sm"
        >
          Ejemplo: divisor
        </button>
        <button
          onClick={() => { setError(null); setNetlist(EJEMPLO_LAMPARA) }}
          className="px-4 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-sm"
        >
          Ejemplo: lámpara
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-700 text-red-200 text-sm">
          ⚠️ {error}
        </div>
      )}

      <div className="flex flex-wrap gap-6 items-start">
        {/* Protoboard */}
        <div className="bg-slate-800 p-4 rounded-xl overflow-auto">
          <Protoboard componentes={componentes} cables={cables} nodos={nodos} />
        </div>

        {/* JSON crudo del netlist */}
        {netlist && (
          <div className="bg-slate-800 p-4 rounded-xl max-w-md">
            <h2 className="text-sm uppercase text-slate-400 mb-2">Netlist (JSON del backend)</h2>
            <pre className="text-xs text-slate-300 overflow-auto max-h-[70vh]">
              {JSON.stringify(netlist, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default App

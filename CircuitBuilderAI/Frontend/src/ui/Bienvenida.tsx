import { useEffect, useRef, useState } from 'react'
import { ImageUp, Plus, Sun, Moon } from 'lucide-react'
import { analizarEsquematico } from '../api/analizar'
import { planificarCircuito } from '../api/planificar'
import { EJEMPLO_PLANNER } from '../circuit/layout'
import TemaProvider, { type Tema } from './theme'
import { LogoWordmark } from './Logo'
import { PROVEEDORES, INTENCIONES, type Intencion, type Sesion, type Nivel } from './tipos'

type Props = { onListo: (sesion: Sesion) => void; nivel: Nivel }

// Chats previos — cascarón visual (issue #88, historial de sesiones aún no
// implementado). Solo para que la marca se sienta completa desde ya.
const CHATS_PREVIOS = ['Divisor de voltaje', 'Semáforo con 555', 'Sensor de luz LDR']

// Pantalla de entrada: subir esquemático + prompt opcional + modelo.
// Si no hay prompt, se pregunta la intención con un cuestionario ligero.
function Bienvenida({ onListo, nivel }: Props) {
  const [imagen, setImagen] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [proveedor, setProveedor] = useState(PROVEEDORES[0])
  const [fase, setFase] = useState<'form' | 'intencion' | 'cargando'>('form')
  const [mensajeCarga, setMensajeCarga] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [tema, setTema] = useState<Tema>('light')
  const inputRef = useRef<HTMLInputElement>(null)

  // Miniatura del esquemático subido.
  useEffect(() => {
    if (!imagen) { setPreview(null); return }
    const url = URL.createObjectURL(imagen)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [imagen])

  function recibirArchivo(file: File | undefined | null) {
    if (file && file.type.startsWith('image/')) {
      setImagen(file)
      setError(null)
    }
  }

  function continuar() {
    if (!imagen) return
    // Con prompt la intención es explícita; sin prompt, cuestionario ligero.
    if (prompt.trim()) ejecutar('armar')
    else setFase('intencion')
  }

  // Pipeline real (§11.B): ① /analizar → ② /planificar → vista principal.
  async function ejecutar(intencion: Intencion) {
    if (!imagen) return
    setFase('cargando')
    setError(null)
    try {
      setMensajeCarga('Analizando tu esquemático…')
      const analisis = await analizarEsquematico(imagen, proveedor)
      if (!analisis.resultado) throw new Error(analisis.mensaje ?? 'No se pudo leer el esquemático.')

      setMensajeCarga('Planificando el armado en la protoboard…')
      const plan = await planificarCircuito(analisis.resultado, proveedor, 'UNDER')
      if (!plan.instrucciones?.length) throw new Error(plan.mensaje ?? 'El planner no devolvió pasos.')

      onListo({
        instrucciones: plan.instrucciones,
        netlist: analisis.resultado,
        prompt: prompt.trim(),
        intencion,
        proveedor,
        nombre: imagen.name.replace(/\.[^.]+$/, ''),
        nivel,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
      setFase('form')
    }
  }

  // Demo sin gastar API (divisor de voltaje del planner).
  function verEjemplo() {
    onListo({
      instrucciones: EJEMPLO_PLANNER,
      netlist: null,
      prompt: '',
      intencion: 'ejemplo',
      proveedor,
      nombre: 'Divisor de voltaje (ejemplo)',
      nivel,
    })
  }

  return (
    <TemaProvider tema={tema} className="min-h-screen flex" style={{ color: 'var(--ink)', background: 'linear-gradient(135deg,var(--bg1),var(--bg2))' }}>
      {/* ---- Sidebar de chats previos (cascarón, issue #88) ---- */}
      <aside className="hidden md:flex w-64 flex-col shrink-0 p-4 gap-3" style={{ borderRight: '1px solid var(--border)' }}>
        <span className="text-sm font-semibold mb-1">Chats</span>

        {/* Nuevo chat: acción, no una conversación existente — sin resaltado de "seleccionado" */}
        <button
          className="flex items-center gap-3 px-3 py-2 rounded-xl transition hover:brightness-95"
          style={{ border: '1px solid var(--border)' }}
        >
          <span
            className="grid place-items-center w-7 h-7 rounded-full shrink-0"
            style={{ background: 'color-mix(in srgb, var(--ink) 12%, transparent)' }}
          >
            <Plus size={15} />
          </span>
          <span className="text-sm font-medium">Nuevo chat</span>
        </button>

        {CHATS_PREVIOS.map((c, i) => (
          <button
            key={c}
            className="text-left text-sm px-3 py-2 rounded-xl truncate transition"
            style={i === 0 ? { background: 'var(--accent)', color: 'var(--bg2)' } : { color: 'var(--ink-soft)' }}
          >
            {c}
          </button>
        ))}
      </aside>

      <div className="flex-1 flex flex-col items-center p-6 pt-24 relative overflow-y-auto">
        <div className="absolute inset-0 holes opacity-40 pointer-events-none" />

        <button
          onClick={() => setTema((t) => (t === 'light' ? 'dark' : 'light'))}
          className="absolute top-5 right-5 grid place-items-center w-10 h-10 rounded-full panel hover:-translate-y-0.5 transition"
          title={tema === 'light' ? 'Cambiar a modo noche' : 'Cambiar a modo día'}
        >
          {tema === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        <div className="w-full max-w-xl relative">
          {/* Marca */}
          <div className="flex justify-center mb-8">
            <LogoWordmark height={68} />
          </div>

          {fase === 'cargando' ? (
            /* ---- Estado de carga del pipeline ---- */
            <div className="panel rounded-2xl p-10 flex flex-col items-center gap-4">
              <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
              <p className="text-sm font-medium">{mensajeCarga}</p>
              <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Esto puede tardar unos segundos.</p>
            </div>
          ) : fase === 'intencion' ? (
            /* ---- Cuestionario ligero: ¿qué necesitas del esquemático? ---- */
            <div className="panel rounded-2xl p-6">
              <p className="text-sm font-semibold mb-1">¿Qué necesitas de este esquemático?</p>
              <p className="text-xs mb-4" style={{ color: 'var(--ink-soft)' }}>Subiste la imagen sin indicaciones — dime qué buscas.</p>
              <div className="space-y-2">
                {INTENCIONES.map((op) => (
                  <button
                    key={op.id}
                    onClick={() => ejecutar(op.id)}
                    className="w-full text-left panel rounded-xl px-4 py-3 hover:brightness-95 hover:-translate-y-0.5 transition flex items-start gap-3"
                  >
                    <op.Icono size={20} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                    <span>
                      <span className="block text-sm font-medium">{op.titulo}</span>
                      <span className="block text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>{op.detalle}</span>
                    </span>
                  </button>
                ))}
              </div>
              <button onClick={() => setFase('form')} className="mt-4 text-xs hover:underline" style={{ color: 'var(--ink-soft)' }}>
                ← Volver
              </button>
            </div>
          ) : (
            /* ---- Formulario principal ---- */
            <div className="panel rounded-2xl p-6 space-y-4">
              {/* Zona de subida (click o arrastrar) */}
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={(e) => { e.preventDefault(); setArrastrando(false); recibirArchivo(e.dataTransfer.files?.[0]) }}
                className="rounded-xl border-2 border-dashed cursor-pointer grid place-items-center min-h-36 p-4 transition"
                style={{ borderColor: arrastrando ? 'var(--accent)' : 'var(--border)', background: arrastrando ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--bg1)' }}
              >
                <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => recibirArchivo(e.target.files?.[0])} />
                {preview ? (
                  <div className="flex items-center gap-4">
                    <img src={preview} alt="Esquemático" className="max-h-28 rounded-lg" />
                    <div className="text-sm">
                      <p className="font-medium">{imagen?.name}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>Haz clic para cambiar la imagen</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <ImageUp size={28} className="mx-auto mb-2" style={{ color: 'var(--ink-soft)' }} />
                    <p className="text-sm font-medium">Arrastra o elige tu esquemático</p>
                  </div>
                )}
              </div>

              {/* Prompt opcional */}
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={2}
                placeholder="¿Qué quieres hacer con él? (opcional)"
                className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
                style={{ background: 'var(--bg1)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />

              {/* Modelo (cascarón: el selector existe, el LLM de chat aún no) */}
              <div className="flex items-center gap-3">
                <label className="text-xs uppercase tracking-widest" style={{ color: 'var(--ink-soft)' }}>Modelo</label>
                <select
                  value={proveedor}
                  onChange={(e) => setProveedor(e.target.value)}
                  className="rounded-lg px-3 py-1.5 text-sm outline-none"
                  style={{ background: 'var(--bg1)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                >
                  {PROVEEDORES.map((p) => <option key={p} value={p} style={{ background: 'var(--bg2)' }}>{p}</option>)}
                </select>
                <button
                  onClick={continuar}
                  disabled={!imagen}
                  className="ml-auto px-5 py-2 rounded-xl accent-bg text-white text-sm font-medium shadow-lg hover:brightness-110 disabled:opacity-40 transition"
                >
                  Comenzar →
                </button>
              </div>

              {error && (
                <div className="rounded-xl px-3 py-2 text-sm flex items-start gap-2" style={{ background: 'rgba(220,38,38,.12)', border: '1px solid rgba(220,38,38,.4)', color: '#fca5a5' }}>
                  <span>⚠️</span><span>{error}</span>
                </div>
              )}
            </div>
          )}

          {/* Pie: demo sin API */}
          {fase === 'form' && (
            <p className="text-center mt-5 text-xs" style={{ color: 'var(--ink-soft)' }}>
              ¿Solo quieres verlo funcionando?{' '}
              <button onClick={verEjemplo} className="hover:underline font-medium" style={{ color: 'var(--accent)' }}>
                Probar con un ejemplo
              </button>
            </p>
          )}
        </div>
      </div>
    </TemaProvider>
  )
}

export default Bienvenida

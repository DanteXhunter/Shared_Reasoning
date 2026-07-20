import { useEffect, useRef, useState } from 'react'
import { ImageUp, Plus, Sun, Moon } from 'lucide-react'
import { analizarEsquematico } from '../api/analizar'
import { planificarCircuito } from '../api/planificar'
import { crearSesion, abrirSesion } from '../api/sesiones'
import { type Usuario } from '../api/auth'
import PanelUsuario from './PanelUsuario'
import TemaProvider, { type Tema } from './theme'
import { LogoWordmark } from './Logo'
import SelectorModelo from './SelectorModelo'
import { comprimirImagen } from './imagenUtil'
import { useHistorialSesiones, BuscadorHistorial, ItemHistorial, ToastHistorial } from './HistorialSesiones'
import { INTENCIONES, type Intencion, type Sesion, type Nivel } from './tipos'

// Lado máximo del esquemático guardado — más grande que el de la foto de
// perfil (512px) porque un circuito necesita más detalle para seguir siendo
// legible (valores de componentes, etiquetas de pines).
const ESQUEMA_LADO_MAX = 1200

type Props = {
  onListo: (sesion: Sesion) => void
  nivel: Nivel
  usuario: Usuario | null
  onActualizarUsuario: (u: Usuario) => void
  onCerrarSesion: () => void
}

// Por ahora la única intención soportada end-to-end es "armar la protoboard"
// (las otras dos —pregunta/entender— necesitan una UI que aún no existe).
const INTENCIONES_ACTIVAS = INTENCIONES.filter((op) => op.id === 'armar')

// Prompt por defecto cuando el usuario sube un esquemático SIN escribir nada y
// elige "Armarlo en la protoboard". Sustituye al prompt que el usuario no dio:
// pide el armado físico paso a paso siguiendo las convenciones del proyecto
// (rieles primero, polaridad, colores de cable — §7.B del CLAUDE del proyecto).
const PROMPT_ARMAR_PROTOBOARD = [
  'Arma este esquemático en una protoboard, paso a paso.',
  'Guíame en la construcción física del circuito indicando, para cada componente,',
  'en qué fila y columna de la protoboard va, respetando la polaridad donde aplique.',
  'Usa la convención de colores de cable: rojo para la alimentación positiva (VCC),',
  'negro para tierra (GND) y otros colores para señales o cables que se crucen.',
  'Ordena los pasos de forma lógica: primero la alimentación y los rieles,',
  'luego los componentes, y al final las conexiones y la verificación.',
  'Explica cada paso con claridad para poder armarlo físicamente sin conocimientos previos.',
].join(' ')

// Pantalla de entrada: subir esquemático + prompt opcional + modelo.
// Si no hay prompt, se pregunta la intención con un cuestionario ligero.
function Bienvenida({ onListo, nivel, usuario, onActualizarUsuario, onCerrarSesion }: Props) {
  const [imagen, setImagen] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  // Vacíos hasta que SelectorModelo cargue el catálogo y aplique el default.
  const [proveedor, setProveedor] = useState('')
  const [proveedorRazon, setProveedorRazon] = useState('')
  const [fase, setFase] = useState<'form' | 'intencion' | 'cargando'>('form')
  const [mensajeCarga, setMensajeCarga] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [tema, setTema] = useState<Tema>('light')
  const inputRef = useRef<HTMLInputElement>(null)

  // Historial real de sesiones del usuario para el sidebar (#73/#88), con
  // búsqueda, renombrar y borrar (#88 ampliado).
  const { filas: historial, aviso: avisoHistorial, busqueda, setBusqueda, renombrar, borrar } = useHistorialSesiones()

  // Abre una sesión guardada y salta directo al workspace.
  async function abrir(id: string) {
    try {
      onListo(await abrirSesion(id, { proveedor, proveedorRazon, nivel }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la sesión.')
    }
  }

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
    // Si el usuario no escribió nada y eligió armar, usamos el prompt por
    // defecto detallado en su lugar (el prompt que "no dio").
    const promptEfectivo = prompt.trim() || PROMPT_ARMAR_PROTOBOARD
    setFase('cargando')
    setError(null)
    try {
      setMensajeCarga('Analizando tu esquemático…')
      const imagenEsquema = await comprimirImagen(imagen, ESQUEMA_LADO_MAX)
      const analisis = await analizarEsquematico(imagen, proveedor)
      if (!analisis.resultado) throw new Error(analisis.mensaje ?? 'No se pudo leer el esquemático.')

      setMensajeCarga('Planificando el armado en la protoboard…')
      const plan = await planificarCircuito(analisis.resultado, proveedor, proveedorRazon, nivel)
      if (!plan.instrucciones?.length) throw new Error(plan.mensaje ?? 'El planner no devolvió pasos.')

      // El nombre lo interpreta la IA a partir del circuito; si no vino,
      // caemos al nombre del archivo sin extensión.
      const nombre = analisis.resultado.nombre?.trim() || imagen.name.replace(/\.[^.]+$/, '')

      // Métricas del análisis inicial — se persisten con la sesión para que la
      // pestaña "Métricas" no se pierda al recargar o reabrir del historial.
      const metricasProceso = { extractor: analisis.uso, planner: plan.uso }

      // Persistimos la sesión (#73) para que aparezca en el historial. Si falla,
      // seguimos sin id: el workspace funciona igual, solo no se guardará.
      let id: string | undefined
      try {
        id = await crearSesion({ nombre, netlist: analisis.resultado, instrucciones: plan.instrucciones, imagenEsquema, metricas: metricasProceso })
      } catch {
        id = undefined
      }

      onListo({
        id,
        instrucciones: plan.instrucciones,
        netlist: analisis.resultado,
        prompt: promptEfectivo,
        intencion,
        proveedor,
        proveedorRazon,
        nombre,
        nivel,
        imagenEsquema,
        metricasProceso,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
      setFase('form')
    }
  }

  return (
    <TemaProvider tema={tema} className="min-h-screen flex" style={{ color: 'var(--ink)', background: 'linear-gradient(135deg,var(--bg1),var(--bg2))' }}>
      <ToastHistorial mensaje={avisoHistorial} />
      {/* ---- Sidebar: historial real de sesiones del usuario (#73) ---- */}
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

        <BuscadorHistorial value={busqueda} onChange={setBusqueda} />

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1">
          {historial.length === 0 ? (
            <span className="text-xs px-3 py-2" style={{ color: 'var(--ink-soft)' }}>
              {busqueda.trim() ? 'Sin resultados.' : 'Aún no tienes circuitos guardados.'}
            </span>
          ) : (
            historial.map((c) => (
              <ItemHistorial
                key={c.id}
                fila={c}
                onAbrir={() => abrir(c.id)}
                onRenombrar={(nombre) => renombrar(c.id, nombre)}
                onBorrar={() => borrar(c.id)}
              />
            ))
          )}
        </div>

        {/* Cuenta del usuario (nombre/correo, CRUD de perfil, cerrar sesión) */}
        {usuario && (
          <div className="shrink-0 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <PanelUsuario
              usuario={usuario}
              onActualizar={onActualizarUsuario}
              onCerrarSesion={onCerrarSesion}
            />
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-y-auto">
        <div className="absolute inset-0 holes opacity-40 pointer-events-none" />

        <button
          onClick={() => setTema((t) => (t === 'light' ? 'dark' : 'light'))}
          className="absolute top-5 right-5 grid place-items-center w-10 h-10 rounded-full panel hover:-translate-y-0.5 transition"
          title={tema === 'light' ? 'Cambiar a modo noche' : 'Cambiar a modo día'}
        >
          {tema === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        <div className="w-full max-w-2xl relative my-auto">
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
              <p className="text-xs mb-4" style={{ color: 'var(--ink-soft)' }}>Subiste la imagen sin indicaciones — arma el circuito en la protoboard paso a paso.</p>
              <div className="space-y-2">
                {INTENCIONES_ACTIVAS.map((op) => (
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
                className="rounded-xl border-2 border-dashed cursor-pointer grid place-items-center min-h-48 p-4 transition"
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
                onKeyDown={(e) => {
                  // Enter envía; Shift+Enter inserta salto de línea.
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    continuar()
                  }
                }}
                rows={2}
                placeholder="¿Qué quieres hacer con él? (opcional)"
                className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
                style={{ background: 'var(--bg1)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />

              {/* Modelos: uno para leer la imagen (visión) y otro para el
                  planner/chat (razonamiento) — cada catálogo agrupado en
                  pago / free / locales, servido por el backend. */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-xs uppercase tracking-widest" style={{ color: 'var(--ink-soft)' }}>Visión</label>
                  <SelectorModelo rol="vision" value={proveedor} onChange={setProveedor} />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs uppercase tracking-widest" style={{ color: 'var(--ink-soft)' }}>Razón</label>
                  <SelectorModelo rol="razon" value={proveedorRazon} onChange={setProveedorRazon} />
                </div>
                <button
                  onClick={continuar}
                  disabled={!imagen || !proveedor || !proveedorRazon}
                  className="ml-auto px-5 py-2 rounded-xl accent-bg text-white text-sm font-medium shadow-lg hover:brightness-110 disabled:opacity-40 transition"
                >
                  Comenzar →
                </button>
              </div>

              {error && (
                <div className="rounded-xl px-3 py-2 text-sm flex items-start gap-2" style={{ background: 'rgba(220,38,38,.12)', border: '1px solid rgba(220,38,38,.4)', color: '#fca5a5' }}>
                  <span>⚠️</span><span className="whitespace-pre-line">{error}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </TemaProvider>
  )
}

export default Bienvenida

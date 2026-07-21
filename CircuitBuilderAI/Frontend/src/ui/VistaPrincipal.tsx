import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus, History, PanelLeft, ArrowLeft, ArrowRight,
  Eye, EyeOff, User, LayoutGrid, ChevronDown, X, Settings, LogOut, Share2,
} from 'lucide-react'
import Protoboard from '../components/Protoboard'
import ComponentGallery from '../components/ComponentGallery'
import JsonView from '../components/JsonView'
import ChatPanel, { type Mensaje } from './ChatPanel'
import { ModalCuenta } from './PanelUsuario'
import Avatar from './Avatar'
import TemaProvider from './theme'
import { LogoWordmark } from './Logo'
import { layoutDesdeInstrucciones, normalizarTipo, colorCable } from '../circuit/layout'
import MiniComponente, { MiniCable } from '../components/MiniComponente'
import { calcularBandas } from '../circuit/resistorColorCode'
import { boardSize } from '../circuit/grid'
import type { Sesion } from './tipos'
import type { Instruccion, Netlist, Uso } from '../circuit/types'
import { abrirSesion, compartirSesion } from '../api/sesiones'
import { useHistorialSesiones, BuscadorHistorial, ItemHistorial, ToastHistorial } from './HistorialSesiones'
import type { Usuario } from '../api/auth'

type Props = {
  sesion: Sesion
  usuario: Usuario | null
  onNuevo: () => void
  // Cambia a otra sesión (ej. abrir un chat del historial).
  onCargarSesion: (s: Sesion) => void
  onCerrarSesion: () => void
  // Refresca el usuario en App.tsx tras editar perfil/foto/API keys desde Mi cuenta.
  onActualizarUsuario: (u: Usuario) => void
}

const NOMBRE_NIVEL: Record<Sesion['nivel'], string> = { basico: 'Básico', intermedio: 'Intermedio', experto: 'Experto' }
// Límites del ancho arrastrable de la columna de chat (issue: chat responsivo).
const ANCHO_CHAT_MIN = 280
const ANCHO_CHAT_DEFAULT = 320
const RIEL_W = 56 // w-14
const PANEL_DERECHO_W = 384 // w-96
const PROTOBOARD_MIN = 360 // ancho mínimo del área central para que siga siendo legible

// "B3" legible desde la coordenada del planner (fila=número, columna=letra).
function coordTexto(fila: number, columna: string): string {
  const c = columna.trim()
  if (c === '+' || c === '-') return `Riel ${c}`
  return `${c.toUpperCase()}${fila}`
}

function formatTiempo(segundos: number): string {
  const m = Math.floor(segundos / 60).toString().padStart(2, '0')
  const s = Math.floor(segundos % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// Una sección de la pestaña "Código": título + botón de copiar + JSON resaltado.
function SeccionCodigo({ titulo, data }: { titulo: string; data: unknown }) {
  const [copiado, setCopiado] = useState(false)

  function copiar() {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    })
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--ink-soft)' }}>{titulo}</span>
        <button
          onClick={copiar}
          className="text-xs px-2.5 py-1 rounded-lg transition hover:opacity-80"
          style={{ background: 'var(--bg1)', color: 'var(--ink)' }}
        >
          {copiado ? '✓ Copiado' : 'Copiar JSON'}
        </button>
      </div>
      <JsonView data={data} className="p-3 bg-slate-950/90 text-slate-100 max-h-[70vh]" />
    </div>
  )
}

// Pestaña "Código": el netlist y las instrucciones tal cual los devuelve el
// backend — sirve para pegarle este JSON a alguien y verificar la topología
// exacta en vez de leerla a ojo desde el dibujo de la protoboard.
function PanelCodigo({ netlist, instrucciones }: { netlist: Netlist | null; instrucciones: Instruccion[] }) {
  return (
    <div className="absolute inset-0 overflow-y-auto p-5 flex flex-col gap-4">
      <SeccionCodigo titulo="Netlist" data={netlist ?? { mensaje: 'Sin netlist (sesión de ejemplo o cargada sin análisis).' }} />
      <SeccionCodigo titulo="Instrucciones" data={instrucciones} />
    </div>
  )
}

// ---- Pestaña "Métricas" ----
// Traduce a texto legible cada intención de chat que ya devuelve el backend
// (agents/chat_agent_v2.py) — solo etiquetas, la clasificación real la hace el LLM.
const ETIQUETA_INTENCION: Record<string, string> = {
  responder: 'Pregunta',
  modificar_netlist: 'Netlist',
  modificar_posiciones: 'Posición',
  proponer_alternativa: 'Alternativa',
}

function formatNum(n?: number): string {
  return typeof n === 'number' ? n.toLocaleString('es-MX') : '—'
}

function formatSeg(s?: number): string {
  return typeof s === 'number' ? `${s.toFixed(1)}s` : '—'
}

function TarjetaResumen({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-1" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--ink-soft)' }}>{titulo}</span>
      <span className="text-2xl font-bold">{valor}</span>
    </div>
  )
}

// Una tarjeta por agente (Extractor/Planner) con su consumo real de esa corrida.
// El nombre del modelo va como texto plano bajo el título (no como badge/pill)
// porque "gemini-flash-lite-latest" no cabe en una píldora sin partirse en
// 2-3 líneas feas — como texto normal simplemente hace wrap limpio.
function TarjetaAgente({ etiqueta, uso }: { etiqueta: string; uso?: Uso }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <div className="px-4 py-2 flex flex-col gap-0.5" style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--ink-soft)' }}>{etiqueta}</span>
        {uso && (
          <span className="text-xs font-mono break-all" style={{ color: 'var(--ink)' }}>{uso.modelo_activo ?? '—'}</span>
        )}
      </div>
      {uso ? (
        <div className="flex flex-col gap-3 p-4" style={{ background: 'var(--bg1)' }}>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <span className="block text-xs" style={{ color: 'var(--ink-soft)' }}>Entrada</span>
              <span className="text-lg font-semibold">{formatNum(uso.tokens_entrada)}</span>
            </div>
            <div>
              <span className="block text-xs" style={{ color: 'var(--ink-soft)' }}>Salida</span>
              <span className="text-lg font-semibold">{formatNum(uso.tokens_salida)}</span>
            </div>
            <div>
              <span className="block text-xs" style={{ color: 'var(--ink-soft)' }}>Total</span>
              <span className="text-lg font-semibold" style={{ color: 'var(--accent)' }}>{formatNum(uso.tokens_total)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <div>
              <span className="block text-xs" style={{ color: 'var(--ink-soft)' }}>Tiempo</span>
              <span className="text-lg font-semibold">{formatSeg(uso.tiempo_segundos)}</span>
            </div>
            <div>
              <span className="block text-xs" style={{ color: 'var(--ink-soft)' }}>Intentos</span>
              <span className="text-lg font-semibold">{uso.intentos ?? '—'}</span>
            </div>
          </div>

          {/* Desglose por intento (#95) — solo tiene sentido mostrarlo cuando
              hubo más de un intento (la IA se equivocó al menos una vez antes
              de la propuesta válida). Con 1 intento, los números de arriba ya
              cuentan toda la historia. */}
          {uso.intentos_detalle && uso.intentos_detalle.length > 1 && (
            <div className="flex flex-col gap-1.5 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="block text-xs" style={{ color: 'var(--ink-soft)' }}>Desglose por intento</span>
              {uso.intentos_detalle.map((d) => (
                <div
                  key={d.numero}
                  className="flex items-start justify-between gap-3 text-xs rounded-lg px-2.5 py-1.5"
                  style={{ background: d.exito ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'color-mix(in srgb, #ef4444 10%, transparent)' }}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-semibold" style={{ color: d.exito ? 'var(--accent)' : '#ef4444' }}>
                      Intento {d.numero} · {d.exito ? 'válido' : 'falló'}
                    </span>
                    {!d.exito && d.error && (
                      <span className="truncate" style={{ color: 'var(--ink-soft)' }} title={d.error}>{d.error}</span>
                    )}
                  </div>
                  <span className="shrink-0 font-mono" style={{ color: 'var(--ink-soft)' }}>
                    {formatNum(d.tokens_total)} · {formatSeg(d.tiempo_segundos)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm p-4" style={{ background: 'var(--bg1)', color: 'var(--ink-soft)' }}>Sin datos (sesión de ejemplo).</p>
      )}
    </div>
  )
}

// Consumo real reportado por el backend en cada llamada (agents/estado.py
// MetricasAgente) — no se inventa nada aquí, solo se muestra bonito. La corrida
// inicial viene de Bienvenida.tsx; cada turno del chat se acumula en vivo.
function PanelMetricas({ metricasProceso, usoChat }: { metricasProceso?: Sesion['metricasProceso']; usoChat: { uso: Uso; intencion: string }[] }) {
  const extractor = metricasProceso?.extractor
  const planner = metricasProceso?.planner
  const todos = [extractor, planner, ...usoChat.map((u) => u.uso)].filter((u): u is Uso => Boolean(u))
  const totalTokens = todos.reduce((acc, u) => acc + (u.tokens_total ?? 0), 0)
  const totalTiempo = todos.reduce((acc, u) => acc + (u.tiempo_segundos ?? 0), 0)

  // Visión = solo el extractor (el único agente que lee la imagen). Razón =
  // planner + cada turno del chat (clasificar/modificar/responder son texto,
  // nunca ven la imagen) — split pedido para #95.
  const visionTokens = extractor?.tokens_total ?? 0
  const visionTiempo = extractor?.tiempo_segundos ?? 0
  const razonTokens = (planner?.tokens_total ?? 0) + usoChat.reduce((acc, u) => acc + (u.uso.tokens_total ?? 0), 0)
  const razonTiempo = (planner?.tiempo_segundos ?? 0)
    + usoChat.reduce((acc, u) => acc + (u.uso.tiempo_total_segundos ?? u.uso.tiempo_segundos ?? 0), 0)

  if (todos.length === 0) {
    return (
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>Sin métricas para esta sesión (ejemplo o cargada sin análisis).</span>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 overflow-y-auto p-5 flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-3">
        <TarjetaResumen titulo="Tokens totales" valor={formatNum(totalTokens)} />
        <TarjetaResumen titulo="Tiempo acumulado" valor={formatSeg(totalTiempo)} />
        <TarjetaResumen titulo="Llamadas al modelo" valor={String(todos.length)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TarjetaResumen titulo="Visión (tokens · tiempo)" valor={`${formatNum(visionTokens)} · ${formatSeg(visionTiempo)}`} />
        <TarjetaResumen titulo="Razón (tokens · tiempo)" valor={`${formatNum(razonTokens)} · ${formatSeg(razonTiempo)}`} />
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-soft)' }}>Análisis inicial</h3>
        <div className="grid grid-cols-2 gap-3">
          <TarjetaAgente etiqueta="Extractor (visión)" uso={extractor} />
          <TarjetaAgente etiqueta="Planner (razón)" uso={planner} />
        </div>
      </div>

      {usoChat.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-soft)' }}>Interacciones del chat</h3>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg2)' }}>
                  <th className="text-left font-semibold px-3 py-2" style={{ color: 'var(--ink-soft)' }}>Intención</th>
                  <th className="text-left font-semibold px-3 py-2" style={{ color: 'var(--ink-soft)' }}>Modelo</th>
                  <th className="text-right font-semibold px-3 py-2" style={{ color: 'var(--ink-soft)' }}>Tokens</th>
                  <th className="text-right font-semibold px-3 py-2" style={{ color: 'var(--ink-soft)' }}>Tiempo</th>
                </tr>
              </thead>
              <tbody>
                {usoChat.map(({ uso, intencion }, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)', background: 'var(--bg1)' }}>
                    <td className="px-3 py-2">{ETIQUETA_INTENCION[intencion] ?? intencion}</td>
                    <td className="px-3 py-2 font-mono text-xs">{uso.modelo_activo ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{formatNum(uso.tokens_total)}</td>
                    <td className="px-3 py-2 text-right">{formatSeg(uso.tiempo_total_segundos ?? uso.tiempo_segundos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// Vista principal "Paralelo" — layout tomado del mockup de diseño 2026-07-06:
// top nav con tabs, sidebar de chats, protoboard central, panel de detalle a
// la derecha (paso, instrucción, componente, coordenadas, lista de componentes)
// y barra de estadísticas abajo.
function VistaPrincipal({
  sesion, usuario, onNuevo, onCargarSesion, onCerrarSesion, onActualizarUsuario,
}: Props) {
  const [instrucciones, setInstrucciones] = useState(sesion.instrucciones)
  const [configuracionAbierta, setConfiguracionAbierta] = useState(false)
  const total = instrucciones.length
  const [paso, setPaso] = useState(1)
  const [revelado, setRevelado] = useState(true)
  const [tab, setTab] = useState<'simulacion' | 'esquema' | 'codigo' | 'metricas'>('simulacion')
  // Consumo de cada turno del chat (tokens/tiempo/modelo) — ver pestaña
  // "Métricas". Se siembra con lo ya persistido en la sesión (al reabrirla del
  // historial) y se sigue acumulando en vivo desde ahí.
  const [usoChat, setUsoChat] = useState<{ uso: Uso; intencion: string }[]>(
    () => sesion.metricasProceso?.chat ?? [],
  )
  const [chatAbierto, setChatAbierto] = useState(true)
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false)
  // Ancho arrastrable de la columna de chat (issue: chat responsivo).
  const [anchoChat, setAnchoChat] = useState(ANCHO_CHAT_DEFAULT)
  const asideRef = useRef<HTMLDivElement>(null)
  const arrastrandoRef = useRef(false)
  const [arrastrando, setArrastrando] = useState(false)
  // La columna alterna entre la conversación actual y el historial de chats.
  const [vistaChats, setVistaChats] = useState<'conversacion' | 'historial'>('conversacion')
  const [verComponentes, setVerComponentes] = useState(true)
  const [verBiblioteca, setVerBiblioteca] = useState(false)
  const [mensajes, setMensajes] = useState<Mensaje[]>(() =>
    sesion.mensajes ?? [
      { de: 'ai', texto: `¡Listo! Analicé tu esquemático «${sesion.nombre}» y lo dividí en ${instrucciones.length} pasos para armarlo en la protoboard. Ve avanzando con las flechas ← → y te voy mostrando cada paso. Si tienes alguna pregunta, aquí estoy.` },
    ],
  )
  const [tiempo, setTiempo] = useState(0)
  // Compartir esta sesión por link (ver ImportarCompartido.tsx + main.py).
  const [compartiendo, setCompartiendo] = useState(false)
  const [linkCopiado, setLinkCopiado] = useState(false)

  async function compartir() {
    if (!sesion.id || compartiendo) return
    setCompartiendo(true)
    try {
      const token = await compartirSesion(sesion.id)
      const link = `${window.location.origin}${window.location.pathname}?compartido=${token}`
      await navigator.clipboard.writeText(link)
      setLinkCopiado(true)
      setTimeout(() => setLinkCopiado(false), 2500)
    } catch {
      // Si falla (sin conexión, etc.), simplemente no se copia nada — el
      // botón vuelve a estar disponible para reintentar.
    } finally {
      setCompartiendo(false)
    }
  }

  // Historial real de sesiones del usuario (#73), con búsqueda, renombrar y
  // borrar (#88 ampliado). Se recarga al cambiar de sesión para que una
  // recién creada aparezca en la lista.
  const {
    filas: historialSesiones, aviso: avisoHistorial, busqueda: busquedaHistorial, setBusqueda: setBusquedaHistorial, renombrar: renombrarSesionHistorial, borrar: borrarSesionHistorial,
  } = useHistorialSesiones(sesion.id)

  // Abre una sesión del historial (trae netlist, instrucciones y chat de la BD).
  async function abrirDelHistorial(id: string) {
    try {
      onCargarSesion(await abrirSesion(id, { proveedor: sesion.proveedor, proveedorRazon: sesion.proveedorRazon, nivel: sesion.nivel }))
    } catch {
      // Si falla la carga, se mantiene la sesión actual sin interrumpir al usuario.
    }
  }

  const instruccionActiva = instrucciones.find((i) => i.numero === paso)
  const interacciones = mensajes.filter((m) => m.de === 'tu').length

  // Cronómetro de la sesión — aproximación de "Tiempo" del mockup.
  useEffect(() => {
    const id = setInterval(() => setTiempo((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Layout del circuito según el paso activo (o completo si revelado está apagado).
  const { componentes, cables, baterias } = useMemo(
    () => layoutDesdeInstrucciones(instrucciones, revelado ? paso : undefined),
    [instrucciones, revelado, paso],
  )

// Convierte una instrucción "colocar_componente" a la forma que usa la
  // tarjeta (bandas de color calculadas para resistores, kind del catálogo).
  function comoTarjeta(i: Instruccion) {
    const esResistor = /resist/i.test(i.componente_tipo ?? '')
    let detalle = i.componente_tipo ?? ''
    if (esResistor && i.componente_valor) {
      try {
        detalle = calcularBandas(i.componente_valor).map((b) => b.nombre).join(' - ')
        detalle = detalle.charAt(0).toUpperCase() + detalle.slice(1)
      } catch {
        detalle = i.componente_tipo ?? ''
      }
    }
    return {
      id: i.componente_id ?? `C${i.numero}`,
      valor: i.componente_valor,
      detalle,
      kind: normalizarTipo(i.componente_tipo ?? ''),
    }
  }

  // Componente del PASO ANTERIOR (no el actual, no todo el historial): el
  // último "colocar_componente" antes del paso activo — la tarjeta de
  // arriba ("Componente(s)") ya muestra el del paso actual, esta lista es
  // referencia de lo que se acaba de colocar justo antes.
  const componentesColocados = useMemo(() => {
    if (!instruccionActiva) return []
    const anterior = [...sesion.instrucciones]
      .filter((i) => i.tipo === 'colocar_componente' && i.numero < instruccionActiva.numero)
      .sort((a, b) => b.numero - a.numero)[0]
    return anterior ? [comoTarjeta(anterior)] : []
  }, [sesion.instrucciones, instruccionActiva])

  // Escala del tablero para encajar en su contenedor.
  const contRef = useRef<HTMLDivElement>(null)
  const [escala, setEscala] = useState(1)
  useEffect(() => {
    const el = contRef.current
    if (!el) return
    const { width, height } = boardSize()
    const ajustar = () =>
      setEscala(Math.min((el.clientWidth - 32) / width, (el.clientHeight - 32) / height, 1.4))
    ajustar()
    const ro = new ResizeObserver(ajustar)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Arrastre del borde derecho de la columna de chat: la agranda hacia la
  // derecha hasta un máximo que sigue dejando espacio legible a la protoboard.
  function iniciarArrastre(e: React.MouseEvent) {
    e.preventDefault()
    arrastrandoRef.current = true
    setArrastrando(true)
  }
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!arrastrandoRef.current || !asideRef.current) return
      const izquierda = asideRef.current.getBoundingClientRect().left
      const anchoMax = Math.min(720, window.innerWidth - RIEL_W - PANEL_DERECHO_W - PROTOBOARD_MIN)
      const propuesto = e.clientX - izquierda
      setAnchoChat(Math.max(ANCHO_CHAT_MIN, Math.min(propuesto, Math.max(ANCHO_CHAT_MIN, anchoMax))))
    }
    function onUp() {
      arrastrandoRef.current = false
      setArrastrando(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // Navegación de pasos con el teclado (← →), salvo al escribir en un input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = (e.target as HTMLElement)?.tagName
      if (t === 'INPUT' || t === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') setPaso((p) => Math.max(1, p - 1))
      if (e.key === 'ArrowRight') setPaso((p) => Math.min(total, p + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total])

  const tabClass = (t: typeof tab) =>
    `px-4 py-1.5 rounded-full text-sm font-semibold transition ${t === tab ? '' : 'hover:opacity-80'}`

  // Colorimetría propia por modo cuando está seleccionado — cada uno remite
  // a lo que representa: Simulación = acento de marca (protoboard viva),
  // Esquema = azul (convención universal de diagramas eléctricos),
  // Código = slate oscuro (mismo tono que el panel de JSON de abajo).
  const COLOR_TAB: Record<typeof tab, { bg: string; fg: string }> = {
    simulacion: { bg: 'var(--accent)', fg: 'var(--bg2)' },
    esquema: { bg: '#2563eb', fg: '#ffffff' },
    codigo: { bg: '#0f172a', fg: '#e2e8f0' },
    metricas: { bg: '#059669', fg: '#ffffff' },
  }

  return (
    <TemaProvider tema="light" className="h-screen overflow-hidden flex flex-col" style={{ color: 'var(--ink)', background: 'var(--bg2)' }}>
      <ToastHistorial mensaje={avisoHistorial} />
      {/* ============ BARRA SUPERIOR ============ */}
      <header className="h-16 flex items-center gap-4 px-6 shrink-0" style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
        <button onClick={onNuevo} className="hover:opacity-80 transition" title="Volver a bienvenida">
          <LogoWordmark height={30} />
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-1 rounded-full p-1" style={{ background: 'var(--bg1)' }}>
          {(['simulacion', 'esquema', 'codigo', 'metricas'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={tabClass(t)}
              style={t === tab ? { background: COLOR_TAB[t].bg, color: COLOR_TAB[t].fg } : { color: 'var(--ink-soft)' }}
            >
              {t === 'simulacion' ? 'Simulación' : t === 'esquema' ? 'Esquema' : t === 'codigo' ? 'Código' : 'Métricas'}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative">
          <button
            onClick={() => setMenuUsuarioAbierto((a) => !a)}
            className="grid place-items-center w-10 h-10 rounded-full hover:brightness-105 transition text-sm font-semibold overflow-hidden"
            // Sin usuario (fallback al ícono genérico) sí necesita el fondo de
            // acento; con usuario, Avatar ya pinta su propio círculo (foto o
            // inicial) — pintar el botón encima haría que el acento se asome
            // por los márgenes transparentes de las fotos con fondo removido.
            style={usuario ? undefined : { background: 'var(--accent)', color: 'var(--bg2)' }}
            title="Cuenta"
          >
            {usuario ? <Avatar usuario={usuario} size={40} /> : <User size={20} />}
          </button>

          {menuUsuarioAbierto && (
            <>
              {/* Backdrop invisible para cerrar el menú al hacer clic afuera */}
              <button
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenuUsuarioAbierto(false)}
                aria-label="Cerrar menú"
              />
              <div
                className="absolute right-0 top-12 z-20 w-48 rounded-xl shadow-lg overflow-hidden py-1"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
              >
                <button
                  onClick={() => { setMenuUsuarioAbierto(false); setConfiguracionAbierta(true) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-black/5 transition"
                  style={{ color: 'var(--ink)' }}
                >
                  <Settings size={16} />
                  Configuración
                </button>
                <button
                  onClick={() => { setMenuUsuarioAbierto(false); onCerrarSesion() }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-black/5 transition"
                  style={{ color: 'var(--ink)' }}
                >
                  <LogOut size={16} />
                  Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ============ RIEL IZQUIERDO (siempre visible) ============ */}
        <div className="w-14 shrink-0 flex flex-col items-center py-4 gap-2" style={{ borderRight: chatAbierto ? 'none' : '1px solid var(--border)' }}>
          {/* 1º: abrir/cerrar la columna de chat */}
          <button
            onClick={() => setChatAbierto((a) => !a)}
            className="grid place-items-center w-9 h-9 rounded-lg hover:bg-black/5 transition"
            style={chatAbierto ? { background: 'color-mix(in srgb, var(--accent) 20%, transparent)' } : { color: 'var(--accent)' }}
            title={chatAbierto ? 'Minimizar chat' : 'Abrir chat'}
          >
            <PanelLeft size={18} />
          </button>
          {/* 2º: nuevo archivo/circuito */}
          <button onClick={onNuevo} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-black/5 transition" title="Nuevo circuito">
            <Plus size={18} />
          </button>
          {/* 3º: historial de chats */}
          <button
            onClick={() => {
              setChatAbierto(true)
              setVistaChats((v) => (v === 'historial' ? 'conversacion' : 'historial'))
            }}
            className="grid place-items-center w-9 h-9 rounded-lg hover:bg-black/5 transition"
            style={vistaChats === 'historial' && chatAbierto ? { background: 'color-mix(in srgb, var(--accent) 20%, transparent)' } : undefined}
            title={vistaChats === 'historial' && chatAbierto ? 'Volver a la conversación' : 'Historial de chats'}
          >
            <History size={18} />
          </button>
        </div>

        {/* ============ COLUMNA: CHATS + CONVERSACIÓN (colapsable y redimensionable) ============ */}
        <aside
          ref={asideRef}
          className={`shrink-0 flex flex-col gap-3 overflow-hidden relative ${arrastrando ? '' : 'transition-all duration-300'}`}
          style={{
            width: chatAbierto ? `${anchoChat}px` : 0,
            opacity: chatAbierto ? 1 : 0,
            padding: chatAbierto ? '1rem' : 0,
            borderRight: chatAbierto ? '1px solid var(--border)' : 'none',
            pointerEvents: chatAbierto ? 'auto' : 'none',
          }}
        >
          {/* Manija de arrastre — agranda/achica la columna hacia la derecha */}
          {chatAbierto && (
            <div
              onMouseDown={iniciarArrastre}
              className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize z-10 hover:bg-black/10 transition"
              style={arrastrando ? { background: 'color-mix(in srgb, var(--accent) 40%, transparent)' } : undefined}
              title="Arrastra para redimensionar el chat"
            />
          )}
          {/* Encabezado: nombre del chat actual + compartir (el historial vive en el riel ☰) */}
          <div className="flex items-center gap-2 shrink-0 h-8">
            <span className="text-sm font-semibold truncate flex-1">
              {vistaChats === 'historial' ? 'Historial de chats' : sesion.nombre}
            </span>
            {vistaChats !== 'historial' && sesion.id && (
              <button
                onClick={compartir}
                disabled={compartiendo}
                className="grid place-items-center w-7 h-7 rounded-lg hover:bg-black/5 transition shrink-0 disabled:opacity-50"
                style={linkCopiado ? { color: 'var(--accent)' } : { color: 'var(--ink-soft)' }}
                title={linkCopiado ? 'Link copiado' : 'Compartir este chat'}
              >
                <Share2 size={15} />
              </button>
            )}
          </div>
          {linkCopiado && (
            <span className="text-xs -mt-2 shrink-0" style={{ color: 'var(--accent)' }}>
              Link copiado — cualquiera con quien lo compartas puede traerse una copia de este chat.
            </span>
          )}

          {vistaChats === 'historial' ? (
            /* ---- Historial (misma columna), con búsqueda + renombrar/borrar (#88) ---- */
            <div className="flex-1 min-h-0 flex flex-col gap-2">
              <BuscadorHistorial value={busquedaHistorial} onChange={setBusquedaHistorial} />
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
                <button
                  onClick={() => setVistaChats('conversacion')}
                  className="w-full text-left text-sm px-3 py-2 rounded-xl truncate transition"
                  style={{ background: 'var(--accent)', color: 'var(--bg2)' }}
                >
                  {sesion.nombre}
                </button>
                {historialSesiones.filter((c) => c.id !== sesion.id).length === 0 && busquedaHistorial.trim() ? (
                  <span className="block text-xs px-3 py-2" style={{ color: 'var(--ink-soft)' }}>Sin resultados.</span>
                ) : (
                  historialSesiones.filter((c) => c.id !== sesion.id).map((c) => (
                    <ItemHistorial
                      key={c.id}
                      fila={c}
                      onAbrir={() => abrirDelHistorial(c.id)}
                      onRenombrar={(nombre) => renombrarSesionHistorial(c.id, nombre)}
                      onBorrar={() => borrarSesionHistorial(c.id)}
                    />
                  ))
                )}
              </div>
            </div>
          ) : (
            /* ---- Conversación a columna completa ---- */
            <ChatPanel
              mensajes={mensajes}
              onMensajes={setMensajes}
              sesionId={sesion.id}
              netlist={sesion.netlist}
              instrucciones={instrucciones}
              proveedor={sesion.proveedor}
              proveedorRazon={sesion.proveedorRazon}
              nivel={sesion.nivel}
              onInstruccionesActualizadas={(nuevas) => {
                setInstrucciones(nuevas)
                setPaso(1)
              }}
              onUso={(uso, intencion) => setUsoChat((u) => [...u, { uso, intencion }])}
            />
          )}
        </aside>

        {/* ============ ÁREA CENTRAL: PROTOBOARD ============ */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <div
            ref={contRef}
            className={`flex-1 min-h-0 m-5 rounded-2xl relative overflow-hidden ${tab === 'codigo' || tab === 'metricas' ? '' : 'grid place-items-center'}`}
            style={{ background: 'var(--bg1)' }}
          >
            {tab === 'simulacion' ? (
              <Protoboard componentes={componentes} cables={cables} baterias={baterias} escala={escala} />
            ) : tab === 'codigo' ? (
              <PanelCodigo netlist={sesion.netlist} instrucciones={instrucciones} />
            ) : tab === 'metricas' ? (
              <PanelMetricas metricasProceso={sesion.metricasProceso} usoChat={usoChat} />
            ) : sesion.imagenEsquema ? (
              <img
                src={sesion.imagenEsquema}
                alt={`Esquemático de ${sesion.nombre}`}
                className="max-h-full max-w-full object-contain p-5"
              />
            ) : (
              <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                Vista de esquemático — próximamente
              </span>
            )}
            {tab === 'simulacion' && (
              <button
                onClick={() => setRevelado((v) => !v)}
                className="absolute top-3 right-3 grid place-items-center w-8 h-8 rounded-lg shadow"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
                title={revelado ? 'Ver circuito completo' : 'Volver al revelado por paso'}
              >
                {revelado ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            )}
          </div>

          {/* Barra de estadísticas */}
          <div className="h-14 flex items-center gap-10 px-6 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
            <div>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--ink-soft)' }}>Dificultad</p>
              <p className="text-sm font-bold">{NOMBRE_NIVEL[sesion.nivel]}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--ink-soft)' }}>Tiempo</p>
              <p className="text-sm font-bold">{formatTiempo(tiempo)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--ink-soft)' }}>Interacciones</p>
              <p className="text-sm font-bold">{interacciones}</p>
            </div>
          </div>
        </main>

        {/* ============ PANEL DERECHO: DETALLE DEL PASO ============ */}
        <aside className="w-96 shrink-0 flex flex-col p-5 gap-5 overflow-y-auto" style={{ borderLeft: '1px solid var(--border)' }}>
          {/* Navegación de paso */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setPaso((p) => Math.max(1, p - 1))}
              disabled={paso <= 1}
              className="grid place-items-center w-8 h-8 rounded-lg disabled:opacity-30 transition"
              style={{ background: 'var(--bg1)' }}
              title="Paso anterior"
            >
              <ArrowLeft size={16} />
            </button>
            <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
              Paso {paso} <span style={{ color: 'var(--ink-soft)' }}>de {total}</span>
            </span>
            <button
              onClick={() => setPaso((p) => Math.min(total, p + 1))}
              disabled={paso >= total}
              className="grid place-items-center w-8 h-8 rounded-lg disabled:opacity-30 transition"
              style={{ background: 'var(--bg1)' }}
              title="Paso siguiente"
            >
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="flex items-center justify-center gap-1.5">
            {instrucciones.map((ins) => (
              <button
                key={ins.numero}
                onClick={() => setPaso(ins.numero)}
                className="w-2 h-2 rounded-full transition"
                style={{ background: ins.numero <= paso ? 'var(--accent)' : 'var(--border)' }}
                title={`Paso ${ins.numero}`}
              />
            ))}
          </div>

          {instruccionActiva && (
            <>
              <div>
                <p className="text-[10px] uppercase tracking-widest mb-2 text-center" style={{ color: 'var(--ink-soft)' }}>Instrucción</p>
                <p className="text-sm leading-relaxed text-center">{instruccionActiva.descripcion}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 items-stretch">
                {instruccionActiva.componente_id ? (
                  <div className="flex flex-col">
                    <p className="text-[10px] uppercase tracking-widest mb-2 text-center" style={{ color: 'var(--ink-soft)' }}>Componente(s)</p>
                    <div className="rounded-xl p-3 flex-1 min-h-[124px] flex flex-col items-center justify-center gap-1" style={{ background: 'var(--bg1)' }}>
                      <MiniComponente
                        kind={normalizarTipo(instruccionActiva.componente_tipo ?? '')}
                        valor={instruccionActiva.componente_valor ?? undefined}
                      />
                      <span className="text-sm font-semibold">
                        {instruccionActiva.componente_id}
                        {instruccionActiva.componente_valor ? ` ${instruccionActiva.componente_valor}` : ''}
                      </span>
                    </div>
                  </div>
                ) : instruccionActiva.tipo === 'conectar_cable' && instruccionActiva.cable ? (
                  // El jumper también es un componente (§7.B): en este paso hay
                  // que saber qué color de cable tomar, no solo a dónde va.
                  <div className="flex flex-col">
                    <p className="text-[10px] uppercase tracking-widest mb-2 text-center" style={{ color: 'var(--ink-soft)' }}>Componente(s)</p>
                    <div className="rounded-xl p-3 flex-1 min-h-[124px] flex flex-col items-center justify-center gap-1" style={{ background: 'var(--bg1)' }}>
                      <MiniCable color={colorCable(instruccionActiva.cable.color)} />
                      <span className="text-sm font-semibold capitalize">
                        Jumper {instruccionActiva.cable.color}
                      </span>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col">
                  <p className="text-[10px] uppercase tracking-widest mb-2 text-center" style={{ color: 'var(--ink-soft)' }}>Coordenadas</p>
                  <div className="rounded-xl p-3 flex-1 min-h-[124px] flex items-center justify-center gap-2 flex-wrap" style={{ background: 'var(--bg1)' }}>
                    {(instruccionActiva.pines ?? (instruccionActiva.cable ? [instruccionActiva.cable.desde, instruccionActiva.cable.hasta] : []))
                      .map((p, i, arr) => (
                        <span key={i} className="flex items-center gap-1.5">
                          <span className="px-2 py-1 rounded-lg font-mono font-semibold text-xs" style={{ background: 'var(--accent)', color: 'var(--bg2)' }}>
                            {coordTexto(p.fila, p.columna)}
                          </span>
                          {i < arr.length - 1 && <span style={{ color: 'var(--ink-soft)' }}>→</span>}
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Componente del paso anterior (referencia — no todo el historial) */}
          <div className="mt-auto">
            <button
              onClick={() => setVerComponentes((v) => !v)}
              className="w-full flex items-center gap-2 text-sm font-semibold py-2"
            >
              <ChevronDown size={16} className="transition-transform" style={{ transform: verComponentes ? 'none' : 'rotate(-90deg)' }} />
              Paso anterior
            </button>
            {verComponentes && (
              <div className="space-y-2">
                {componentesColocados.map((c, i) => (
                  <div key={`${c.id}-${i}`} className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'var(--bg1)' }}>
                    <div className="shrink-0">
                      <MiniComponente kind={c.kind} valor={c.valor ?? undefined} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {c.id}{c.valor ? ` · ${c.valor}` : ''}
                      </p>
                      <p className="text-xs truncate capitalize" style={{ color: 'var(--ink-soft)' }}>{c.detalle}</p>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => setVerBiblioteca(true)}
                  className="w-full text-xs py-2 rounded-xl hover:opacity-80 transition flex items-center justify-center gap-1.5"
                  style={{ background: 'var(--bg1)', color: 'var(--ink-soft)' }}
                >
                  <LayoutGrid size={14} /> Ver biblioteca completa
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Biblioteca de componentes (overlay) */}
      {verBiblioteca && (
        <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: 'rgba(0,0,0,.5)' }} onClick={() => setVerBiblioteca(false)}>
          <div className="rounded-2xl p-5 max-w-5xl w-full max-h-[85vh] overflow-auto shadow-2xl" style={{ background: 'var(--bg2)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm uppercase tracking-widest" style={{ color: 'var(--ink-soft)' }}>Biblioteca de componentes</h2>
              <button onClick={() => setVerBiblioteca(false)} className="grid place-items-center w-8 h-8 rounded-lg hover:bg-black/5 transition" title="Cerrar">
                <X size={16} />
              </button>
            </div>
            <ComponentGallery componentesSesion={sesion.netlist?.componentes ?? []} />
          </div>
        </div>
      )}

      {/* Configuración → "Mi cuenta": mismo modal que usa Bienvenida (ver
          PanelUsuario), para que perfil/contraseña/API keys/foto de perfil
          sean un único lugar sin importar desde qué pantalla se abra. */}
      {configuracionAbierta && usuario && (
        <ModalCuenta
          usuario={usuario}
          onActualizar={onActualizarUsuario}
          onCerrarSesion={onCerrarSesion}
          onCerrar={() => setConfiguracionAbierta(false)}
        />
      )}
    </TemaProvider>
  )
}

export default VistaPrincipal

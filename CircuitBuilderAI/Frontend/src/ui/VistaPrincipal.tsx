import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FilePlus2, History, ChevronsLeft, ChevronsRight, ArrowLeft, ArrowRight,
  Eye, EyeOff, Code, User, CircuitBoard, LayoutGrid, ChevronDown, X,
} from 'lucide-react'
import Protoboard from '../components/Protoboard'
import ComponentGallery from '../components/ComponentGallery'
import ChatPanel, { type Mensaje } from './ChatPanel'
import TemaProvider from './theme'
import { LogoWordmark } from './Logo'
import { layoutDesdeInstrucciones } from '../circuit/layout'
import { calcularBandas } from '../circuit/resistorColorCode'
import { boardSize } from '../circuit/grid'
import type { Sesion } from './tipos'

type Props = {
  sesion: Sesion
  onNuevo: () => void
  onDev: () => void
  // Cambia a otra sesión (ej. abrir un chat del historial).
  onCargarSesion: (s: Sesion) => void
}

const NOMBRE_NIVEL: Record<Sesion['nivel'], string> = { basico: 'Básico', intermedio: 'Intermedio', experto: 'Experto' }
const CHATS_PREVIOS = ['Divisor de voltaje', 'Semáforo con 555', 'Sensor de luz LDR']

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

// Vista principal "Paralelo" — layout tomado del mockup de diseño 2026-07-06:
// top nav con tabs, sidebar de chats, protoboard central, panel de detalle a
// la derecha (paso, instrucción, componente, coordenadas, lista de componentes)
// y barra de estadísticas abajo.
function VistaPrincipal({ sesion, onNuevo, onDev, onCargarSesion }: Props) {
  const [instrucciones, setInstrucciones] = useState(sesion.instrucciones)
  const total = instrucciones.length
  const [paso, setPaso] = useState(1)
  const [revelado, setRevelado] = useState(true)
  const [tab, setTab] = useState<'simulacion' | 'esquema' | 'codigo'>('simulacion')
  const [chatAbierto, setChatAbierto] = useState(true)
  // La columna alterna entre la conversación actual y el historial de chats.
  const [vistaChats, setVistaChats] = useState<'conversacion' | 'historial'>('conversacion')
  const [verComponentes, setVerComponentes] = useState(true)
  const [verBiblioteca, setVerBiblioteca] = useState(false)
  const [mensajes, setMensajes] = useState<Mensaje[]>(() =>
    sesion.mensajes ?? [
      { de: 'ai', texto: `Listo — preparé ${instrucciones.length} pasos para armar «${sesion.nombre}». Navega con ← → y te muestro cada paso en la protoboard.` },
    ],
  )
  const [tiempo, setTiempo] = useState(0)

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

  // Componentes ya colocados hasta el paso actual, para la lista "Componentes".
  const componentesColocados = useMemo(
    () =>
      instrucciones
        .filter((i) => i.tipo === 'colocar_componente' && i.numero <= paso)
        .map((i) => {
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
          return { id: i.componente_id ?? `C${i.numero}`, valor: i.componente_valor, detalle }
        }),
    [instrucciones, paso],
  )

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

  return (
    <TemaProvider tema="light" className="h-screen overflow-hidden flex flex-col" style={{ color: 'var(--ink)', background: 'var(--bg2)' }}>
      {/* ============ BARRA SUPERIOR ============ */}
      <header className="h-16 flex items-center gap-4 px-6 shrink-0" style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
        <LogoWordmark height={30} />
        <div className="flex-1" />
        <div className="flex items-center gap-1 rounded-full p-1" style={{ background: 'var(--bg1)' }}>
          {(['simulacion', 'esquema', 'codigo'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={tabClass(t)}
              style={t === tab ? { background: 'var(--accent)', color: 'var(--bg2)' } : { color: 'var(--ink-soft)' }}
            >
              {t === 'simulacion' ? 'Simulación' : t === 'esquema' ? 'Esquema' : 'Código'}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={onDev} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-black/5 transition" style={{ color: 'var(--ink-soft)' }} title="Modo desarrollo">
          <Code size={18} />
        </button>
        <div className="grid place-items-center w-10 h-10 rounded-full" style={{ background: 'var(--accent)', color: 'var(--bg2)' }} title="Perfil (próximamente)">
          <User size={20} />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ============ RIEL IZQUIERDO (siempre visible) ============ */}
        <div className="w-14 shrink-0 flex flex-col items-center py-4 gap-2" style={{ borderRight: chatAbierto ? 'none' : '1px solid var(--border)' }}>
          {/* 1º: nuevo archivo/circuito */}
          <button onClick={onNuevo} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-black/5 transition" title="Nuevo circuito">
            <FilePlus2 size={18} />
          </button>
          {/* 2º: historial de chats */}
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
          {/* Pista visual para reabrir cuando está minimizado */}
          {!chatAbierto && (
            <button
              onClick={() => setChatAbierto(true)}
              className="mt-2 grid place-items-center w-9 h-9 rounded-lg hover:bg-black/5 transition"
              style={{ color: 'var(--accent)' }}
              title="Abrir chat"
            >
              <ChevronsRight size={18} />
            </button>
          )}
        </div>

        {/* ============ COLUMNA: CHATS + CONVERSACIÓN (colapsable) ============ */}
        <aside
          className="shrink-0 flex flex-col gap-3 overflow-hidden transition-all duration-300"
          style={{
            width: chatAbierto ? '20rem' : 0,
            opacity: chatAbierto ? 1 : 0,
            padding: chatAbierto ? '1rem' : 0,
            borderRight: chatAbierto ? '1px solid var(--border)' : 'none',
            pointerEvents: chatAbierto ? 'auto' : 'none',
          }}
        >
          {/* Encabezado: nombre del chat actual + minimizar (el historial vive en el riel ☰) */}
          <div className="flex items-center gap-2 shrink-0 h-8">
            {vistaChats === 'historial' && (
              <button
                onClick={() => setVistaChats('conversacion')}
                className="grid place-items-center w-8 h-8 rounded-lg hover:bg-black/5 transition shrink-0"
                title="Volver a la conversación"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <span className="text-sm font-semibold truncate">
              {vistaChats === 'historial' ? 'Historial de chats' : sesion.nombre}
            </span>
            <button
              onClick={() => setChatAbierto(false)}
              className="ml-auto grid place-items-center w-8 h-8 rounded-lg hover:bg-black/5 transition shrink-0"
              style={{ color: 'var(--ink-soft)' }}
              title="Minimizar chat"
            >
              <ChevronsLeft size={16} />
            </button>
          </div>

          {vistaChats === 'historial' ? (
            /* ---- Historial (misma columna, cascarón issue #88) ---- */
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
              <button
                onClick={() => setVistaChats('conversacion')}
                className="w-full text-left text-sm px-3 py-2 rounded-xl truncate transition"
                style={{ background: 'var(--accent)', color: 'var(--bg2)' }}
              >
                {sesion.nombre}
              </button>
              {CHATS_PREVIOS.map((c) => (
                <button key={c} className="w-full text-left text-sm px-3 py-2 rounded-xl truncate transition hover:bg-black/5" style={{ color: 'var(--ink-soft)' }}>
                  {c}
                </button>
              ))}
            </div>
          ) : (
            /* ---- Conversación a columna completa ---- */
            <ChatPanel
              mensajes={mensajes}
              onMensajes={setMensajes}
              netlist={sesion.netlist}
              instrucciones={instrucciones}
              proveedor={sesion.proveedor}
              nivel={sesion.nivel}
              onInstruccionesActualizadas={(nuevas) => {
                setInstrucciones(nuevas)
                setPaso(1)
              }}
            />
          )}
        </aside>

        {/* ============ ÁREA CENTRAL: PROTOBOARD ============ */}
        <main className="flex-1 flex flex-col min-w-0">
          <div ref={contRef} className="flex-1 m-5 rounded-2xl grid place-items-center relative overflow-hidden" style={{ background: 'var(--bg1)' }}>
            {tab === 'simulacion' ? (
              <Protoboard componentes={componentes} cables={cables} baterias={baterias} escala={escala} />
            ) : (
              <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                {tab === 'esquema' ? 'Vista de esquemático — próximamente' : 'Vista de código — próximamente'}
              </span>
            )}
            <button
              onClick={() => setRevelado((v) => !v)}
              className="absolute top-3 right-3 grid place-items-center w-8 h-8 rounded-lg shadow"
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
              title={revelado ? 'Ver circuito completo' : 'Volver al revelado por paso'}
            >
              {revelado ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
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

              <div className="grid grid-cols-2 gap-4">
                {instruccionActiva.componente_id && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest mb-2 text-center" style={{ color: 'var(--ink-soft)' }}>Componente(s)</p>
                    <div className="rounded-xl p-3 flex flex-col items-center gap-1" style={{ background: 'var(--bg1)' }}>
                      <CircuitBoard size={26} style={{ color: 'var(--accent)' }} />
                      <span className="text-sm font-semibold">
                        {instruccionActiva.componente_id}
                        {instruccionActiva.componente_valor ? ` ${instruccionActiva.componente_valor}` : ''}
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-[10px] uppercase tracking-widest mb-2 text-center" style={{ color: 'var(--ink-soft)' }}>Coordenadas</p>
                  <div className="rounded-xl p-3 flex items-center justify-center gap-2 flex-wrap" style={{ background: 'var(--bg1)' }}>
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

          {/* Componentes ya colocados */}
          <div className="mt-auto">
            <button
              onClick={() => setVerComponentes((v) => !v)}
              className="w-full flex items-center gap-2 text-sm font-semibold py-2"
            >
              <ChevronDown size={16} className="transition-transform" style={{ transform: verComponentes ? 'none' : 'rotate(-90deg)' }} />
              Componentes
            </button>
            {verComponentes && (
              <div className="space-y-2">
                {componentesColocados.map((c, i) => (
                  <div key={`${c.id}-${i}`} className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'var(--bg1)' }}>
                    <CircuitBoard size={20} className="shrink-0" style={{ color: 'var(--accent)' }} />
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
            <ComponentGallery />
          </div>
        </div>
      )}
    </TemaProvider>
  )
}

export default VistaPrincipal

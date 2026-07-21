import { useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { BlobMascota } from './Logo'
import { enviarMensajeChat } from '../api/chat'
import type { MensajeHistorial } from '../api/chat'
import type { Instruccion, Netlist, Uso } from '../circuit/types'

export type Mensaje = { de: 'ai' | 'tu'; texto: string }

type Props = {
  mensajes: Mensaje[]
  onMensajes: (m: Mensaje[]) => void
  // id de la sesión en la BD: si está presente, el backend persiste el chat (#73).
  sesionId?: string
  netlist: Netlist | null
  instrucciones: Instruccion[]
  proveedor: string
  proveedorRazon: string
  nivel: string
  onInstruccionesActualizadas: (instrucciones: Instruccion[]) => void
  // El backend devuelve el netlist ya modificado cuando el usuario cambia la
  // TOPOLOGÍA por chat ("quita el LED"). Hay que adoptarlo: el netlist se
  // reenvía en cada mensaje siguiente, así que si se ignora, el modelo recibe
  // un circuito viejo junto a las instrucciones nuevas y se contradice solo.
  onNetlistActualizado: (netlist: Netlist) => void
  // Reporta el consumo de cada turno del chat — ver pestaña "Métricas".
  onUso?: (uso: Uso, intencion: string, tipoInteraccion?: string) => void
}

function ChatPanel({ mensajes, onMensajes, sesionId, netlist, instrucciones, proveedor, proveedorRazon, nivel, onInstruccionesActualizadas, onNetlistActualizado, onUso }: Props) {
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  // Se siembra con los mensajes ya cargados para que el LLM tenga el contexto
  // previo de la conversación (bienvenida o historial restaurado de la BD).
  const [historial, setHistorial] = useState<MensajeHistorial[]>(() =>
    mensajes.map((m) => ({ rol: m.de === 'tu' ? 'user' : 'assistant', contenido: m.texto })),
  )
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [mensajes, cargando])

  async function enviar() {
    const limpio = texto.trim()
    if (!limpio || !netlist || cargando) return

    const nuevoMensajeHistorial: MensajeHistorial = { rol: 'user', contenido: limpio }
    const nuevoHistorial = [...historial, nuevoMensajeHistorial]

    setHistorial(nuevoHistorial)
    onMensajes([...mensajes, { de: 'tu', texto: limpio }])
    setTexto('')
    setCargando(true)

    await enviarMensajeChat({
      netlist,
      historial: nuevoHistorial,
      proveedor,
      proveedorRazon,
      nivel,
      instrucciones,
      sesionId,
      onEvento: (evento) => {
        if (evento.tipo === 'estado') return

        if (evento.tipo === 'respuesta') {
          const respuesta: MensajeHistorial = { rol: 'assistant', contenido: evento.contenido }
          setHistorial((h) => [...h, respuesta])
          onMensajes([...mensajes, { de: 'tu', texto: limpio }, { de: 'ai', texto: evento.contenido }])
          if (evento.uso) onUso?.(evento.uso, evento.intencion_detectada, evento.tipo_interaccion_detectado)
        }

        if (evento.tipo === 'actualizado') {
          const respuesta: MensajeHistorial = { rol: 'assistant', contenido: evento.respuesta }
          setHistorial((h) => [...h, respuesta])
          onMensajes([...mensajes, { de: 'tu', texto: limpio }, { de: 'ai', texto: evento.respuesta }])
          if (evento.netlist_modificado) {
            onNetlistActualizado(evento.netlist_modificado)
          }
          if (evento.instrucciones_actualizadas) {
            onInstruccionesActualizadas(evento.instrucciones_actualizadas)
          }
          if (evento.uso) onUso?.(evento.uso, evento.intencion_detectada, evento.tipo_interaccion_detectado)
        }

        if (evento.tipo === 'error') {
          onMensajes([...mensajes, { de: 'tu', texto: limpio }, { de: 'ai', texto: evento.mensaje }])
        }
      },
    })

    setCargando(false)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 rounded-2xl" style={{ border: '1px solid var(--border)' }}>
      {/* Mensajes */}
      <div ref={scrollRef} className="flex-1 p-3 space-y-3 overflow-y-auto">
        {mensajes.map((m, i) =>
          m.de === 'ai' ? (
            <div key={i} className="flex items-end gap-2">
              <BlobMascota size={28} className="shrink-0" />
              <div className="text-sm rounded-2xl rounded-bl-sm px-3 py-2 max-w-[80%] shadow-sm" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                {m.texto}
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-2 flex-row-reverse">
              <div className="text-sm font-medium rounded-2xl rounded-tr-sm px-3 py-2 max-w-[80%] shadow-sm" style={{ background: 'var(--accent)', color: 'var(--bg2)' }}>
                {m.texto}
              </div>
            </div>
          ),
        )}
        {cargando && (
          <div className="flex items-end gap-2">
            <BlobMascota size={28} className="shrink-0" />
            <div className="text-sm rounded-2xl rounded-bl-sm px-3 py-2 shadow-sm" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--ink-soft)' }}>
              Pensando…
            </div>
          </div>
        )}
      </div>

      {/* Entrada */}
      <div className="p-2 flex gap-2 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && enviar()}
          disabled={!netlist || cargando}
          className="flex-1 rounded-xl px-3 text-sm h-10 outline-none min-w-0 disabled:opacity-50"
          style={{ background: 'var(--bg1)', color: 'var(--ink)' }}
          placeholder={netlist ? '¿Qué te gustaría saber?' : 'Carga un circuito primero'}
        />
        <button
          onClick={enviar}
          disabled={!netlist || !texto.trim() || cargando}
          className="grid place-items-center w-10 h-10 rounded-full hover:brightness-105 transition shadow shrink-0 disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--bg2)' }}
          title="Enviar"
        >
          <ArrowUp size={18} />
        </button>
      </div>
    </div>
  )
}

export default ChatPanel

import { useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { BlobMascota } from './Logo'

export type Mensaje = { de: 'ai' | 'tu'; texto: string }

// Respuesta fija: el agente de chat del backend aún no existe (cascarón §11.C).
const RESPUESTA_EN_CONSTRUCCION =
  '🚧 El asistente de chat está en construcción — pronto podré responderte aquí. ' +
  'Por ahora, sigue los pasos con las flechas ← → del panel derecho.'

type Props = {
  mensajes: Mensaje[]
  onMensajes: (m: Mensaje[]) => void
}

// Conversación del chat (estilo mockup: burbujas del usuario en acento,
// Blob como avatar de la IA). Llena el alto del contenedor padre;
// el colapso/expansión lo maneja VistaPrincipal.
function ChatPanel({ mensajes, onMensajes }: Props) {
  const [texto, setTexto] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll al último mensaje.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [mensajes])

  function enviar() {
    const limpio = texto.trim()
    if (!limpio) return
    onMensajes([...mensajes, { de: 'tu', texto: limpio }, { de: 'ai', texto: RESPUESTA_EN_CONSTRUCCION }])
    setTexto('')
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
      </div>

      {/* Entrada */}
      <div className="p-2 flex gap-2 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && enviar()}
          className="flex-1 rounded-xl px-3 text-sm h-10 outline-none min-w-0"
          style={{ background: 'var(--bg1)', color: 'var(--ink)' }}
          placeholder="¿Qué te gustaría saber?"
        />
        <button
          onClick={enviar}
          className="grid place-items-center w-10 h-10 rounded-full hover:brightness-105 transition shadow shrink-0"
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

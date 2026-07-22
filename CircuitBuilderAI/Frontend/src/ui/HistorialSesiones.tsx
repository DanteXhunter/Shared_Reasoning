import { useEffect, useRef, useState } from 'react'
import { Pencil, Trash2, Search, Check } from 'lucide-react'
import {
  listarSesiones,
  buscarSesiones,
  renombrarSesion,
  borrarSesion,
  type SesionResumen,
  type ResultadoBusqueda,
} from '../api/sesiones'

// Fila del historial: sin búsqueda activa es un SesionResumen normal; con
// búsqueda activa, además trae el fragmento del mensaje donde apareció la
// palabra (estilo WhatsApp) — ver ResultadoBusqueda en api/sesiones.ts.
export type FilaHistorial = SesionResumen | ResultadoBusqueda

// Estado + acciones del historial de conversaciones — un solo lugar para que
// Bienvenida (sidebar) y VistaPrincipal (columna de chat) no dupliquen la
// lógica de listar/buscar/renombrar/borrar.
export function useHistorialSesiones(recargarCuando?: unknown) {
  const [historial, setHistorial] = useState<SesionResumen[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusqueda[] | null>(null)
  // Aviso breve tras borrar/renombrar (toast flotante, ver ToastHistorial).
  const [aviso, setAviso] = useState<string | null>(null)
  const timerAvisoRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function mostrarAviso(texto: string) {
    if (timerAvisoRef.current) clearTimeout(timerAvisoRef.current)
    setAviso(texto)
    timerAvisoRef.current = setTimeout(() => setAviso(null), 2500)
  }

  useEffect(() => () => { if (timerAvisoRef.current) clearTimeout(timerAvisoRef.current) }, [])

  function recargar() {
    listarSesiones().then(setHistorial).catch(() => setHistorial([]))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { recargar() }, [recargarCuando])

  // Debounce de 300ms — igual criterio que un buscador tipo WhatsApp: no
  // pegarle al backend en cada tecla que se escribe.
  useEffect(() => {
    if (!busqueda.trim()) {
      setResultados(null)
      return
    }
    const timer = setTimeout(() => {
      buscarSesiones(busqueda).then(setResultados).catch(() => setResultados([]))
    }, 300)
    return () => clearTimeout(timer)
  }, [busqueda])

  async function renombrar(id: string, nombre: string) {
    await renombrarSesion(id, nombre)
    recargar()
    setResultados((r) => (r ? r.map((s) => (s.id === id ? { ...s, nombre } : s)) : r))
  }

  async function borrar(id: string) {
    await borrarSesion(id)
    recargar()
    setResultados((r) => (r ? r.filter((s) => s.id !== id) : r))
    mostrarAviso('Conversación eliminada.')
  }

  return {
    filas: (resultados ?? historial) as FilaHistorial[],
    aviso,
    buscando: resultados !== null,
    busqueda,
    setBusqueda,
    renombrar,
    borrar,
  }
}

// Toast flotante que confirma el borrado (u otras acciones del historial) —
// se autodesaparece a los 2.5s (ver mostrarAviso en useHistorialSesiones).
export function ToastHistorial({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null
  return (
    <div
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2 rounded-xl text-sm shadow-2xl"
      style={{ background: 'var(--bg1)', border: '1px solid var(--border)', color: 'var(--ink)' }}
    >
      <Check size={14} style={{ color: '#16a34a' }} />
      {mensaje}
    </div>
  )
}

// Input de búsqueda — mismo componente en ambas pantallas para que se vea y
// se comporte igual.
export function BuscadorHistorial({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative shrink-0">
      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ink-soft)' }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar en tus chats…"
        className="w-full rounded-xl pl-8 pr-3 py-1.5 text-xs outline-none"
        style={{ background: 'var(--bg1)', border: '1px solid var(--border)', color: 'var(--ink)' }}
      />
    </div>
  )
}

// Una fila del historial: nombre (o input si se está renombrando) + botones
// de renombrar/borrar que aparecen al pasar el mouse + fragmento de búsqueda
// si aplica. El borrado pide confirmación inline (sin dialog nativo) antes
// de ejecutar la acción irreversible.
export function ItemHistorial({
  fila,
  activo,
  onAbrir,
  onRenombrar,
  onBorrar,
}: {
  fila: FilaHistorial
  activo?: boolean
  onAbrir: () => void
  onRenombrar: (nombre: string) => Promise<void>
  onBorrar: () => Promise<void>
}) {
  const [editando, setEditando] = useState(false)
  const [nombreEditado, setNombreEditado] = useState(fila.nombre)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const fragmento = 'fragmento' in fila ? fila.fragmento : null

  async function guardarNombre() {
    setEditando(false)
    const limpio = nombreEditado.trim()
    if (limpio && limpio !== fila.nombre) {
      await onRenombrar(limpio)
    } else {
      setNombreEditado(fila.nombre)
    }
  }

  if (editando) {
    return (
      <input
        autoFocus
        value={nombreEditado}
        onChange={(e) => setNombreEditado(e.target.value)}
        onBlur={guardarNombre}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') { setNombreEditado(fila.nombre); setEditando(false) }
        }}
        className="w-full text-sm px-3 py-2 rounded-xl outline-none"
        style={{ background: 'var(--bg1)', border: '1px solid var(--accent)', color: 'var(--ink)' }}
      />
    )
  }

  if (confirmarBorrado) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ border: '1px solid rgba(220,38,38,.4)' }}>
        <span className="flex-1 min-w-0 truncate text-xs" style={{ color: 'var(--ink-soft)' }}>¿Borrar «{fila.nombre}»?</span>
        <button
          onClick={onBorrar}
          className="shrink-0 text-xs px-2 py-1 rounded-lg text-white"
          style={{ background: '#dc2626' }}
        >
          Borrar
        </button>
        <button
          onClick={() => setConfirmarBorrado(false)}
          className="shrink-0 text-xs px-2 py-1 rounded-lg"
          style={{ border: '1px solid var(--border)', color: 'var(--ink-soft)' }}
        >
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <div
      className="group flex items-center transition hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
      style={activo ? { background: 'var(--accent)' } : undefined}
    >
      <button onClick={onAbrir} className="flex-1 min-w-0 text-left px-3 py-2">
        <span className="block truncate text-sm" style={{ color: activo ? 'var(--bg2)' : 'var(--ink-soft)' }}>
          {fila.nombre}
        </span>
        {fragmento && (
          <span className="block truncate text-xs mt-0.5" style={{ color: activo ? 'var(--bg2)' : 'var(--ink-soft)', opacity: 0.75 }}>
            {fragmento}
          </span>
        )}
      </button>
      <div className="hidden group-hover:flex items-center gap-0.5 pr-1.5 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); setNombreEditado(fila.nombre); setEditando(true) }}
          title="Renombrar"
          className="grid place-items-center w-6 h-6 rounded-lg hover:bg-black/10 transition"
          style={{ color: activo ? 'var(--bg2)' : 'var(--ink-soft)' }}
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setConfirmarBorrado(true) }}
          title="Borrar"
          className="grid place-items-center w-6 h-6 rounded-lg hover:bg-black/10 transition"
          style={{ color: activo ? 'var(--bg2)' : '#dc2626' }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

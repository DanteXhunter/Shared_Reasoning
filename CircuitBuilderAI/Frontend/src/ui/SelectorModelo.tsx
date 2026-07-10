import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Check, Cloud, Gift, HardDrive, type LucideIcon } from 'lucide-react'
import {
  obtenerProveedores,
  badgeDe,
  type Categoria,
  type CatalogoProveedores,
  type GrupoProveedores,
  type ModeloProveedor,
} from '../api/proveedores'

type Props = {
  value: string
  onChange: (id: string) => void
}

const ICONO_CATEGORIA: Record<Categoria, LucideIcon> = {
  pago: Cloud,
  free: Gift,
  local: HardDrive,
}

// El catálogo lo sirve el backend (GET /proveedores) — antes el front tenía su
// propia lista hardcodeada y se desincronizó (gemini-free nunca se mostraba).
//
// Las categorías van en tabs, no apiladas: con 6 modelos la lista vertical
// desbordaba la tarjeta de bienvenida. Cada tab muestra sus modelos en una
// grilla de 2 columnas, así el panel crece a lo ancho y no a lo alto.
function SelectorModelo({ value, onChange }: Props) {
  const [catalogo, setCatalogo] = useState<CatalogoProveedores | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [tab, setTab] = useState<Categoria | null>(null)
  const [activo, setActivo] = useState(0)
  const contenedorRef = useRef<HTMLDivElement>(null)
  const opcionesRef = useRef<(HTMLLIElement | null)[]>([])

  async function cargar() {
    setError(null)
    try {
      const datos = await obtenerProveedores()
      setCatalogo(datos)
      // El backend decide el modelo inicial; el front solo lo adopta si aún no
      // hay uno elegido.
      if (!value) onChange(datos.por_defecto)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar modelos.')
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const todos = useMemo(
    () => (catalogo?.grupos ?? []).flatMap((g) => g.modelos),
    [catalogo],
  )

  const actual: ModeloProveedor | undefined = useMemo(
    () => todos.find((m) => m.id === value),
    [todos, value],
  )

  // Solo se muestran las categorías que traen modelos.
  const grupos: GrupoProveedores[] = useMemo(
    () => (catalogo?.grupos ?? []).filter((g) => g.modelos.length > 0),
    [catalogo],
  )

  const grupoActivo = useMemo(
    () => grupos.find((g) => g.categoria === tab) ?? grupos[0],
    [grupos, tab],
  )

  // La navegación por teclado se limita a la categoría visible.
  const seleccionables = useMemo(
    () => (grupoActivo?.modelos ?? []).filter((m) => m.disponible),
    [grupoActivo],
  )

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return
    function fuera(e: MouseEvent) {
      if (!contenedorRef.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  // Al abrir, se entra por la categoría del modelo ya elegido.
  useEffect(() => {
    if (!abierto || !actual) return
    setTab(actual.categoria)
  }, [abierto, actual])

  // Al cambiar de tab, el foco del teclado arranca en el modelo elegido si vive
  // en esa categoría; si no, en el primero.
  useEffect(() => {
    if (!abierto) return
    const i = seleccionables.findIndex((m) => m.id === value)
    setActivo(i >= 0 ? i : 0)
  }, [abierto, seleccionables, value])

  useEffect(() => {
    if (abierto) opcionesRef.current[activo]?.scrollIntoView({ block: 'nearest' })
  }, [activo, abierto])

  function elegir(modelo: ModeloProveedor) {
    if (!modelo.disponible) return
    onChange(modelo.id)
    setAbierto(false)
  }

  function moverTab(paso: number) {
    if (!grupoActivo) return
    const i = grupos.findIndex((g) => g.categoria === grupoActivo.categoria)
    const siguiente = grupos[(i + paso + grupos.length) % grupos.length]
    setTab(siguiente.categoria)
  }

  function teclas(e: React.KeyboardEvent) {
    if (!abierto) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setAbierto(true)
      }
      return
    }
    if (e.key === 'Escape' || e.key === 'Tab') return setAbierto(false)
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      moverTab(1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      moverTab(-1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActivo((i) => Math.min(i + 1, seleccionables.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActivo((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const modelo = seleccionables[activo]
      if (modelo) elegir(modelo)
    }
  }

  if (error) {
    return (
      <button
        type="button"
        onClick={cargar}
        className="rounded-lg px-3 py-1.5 text-sm"
        style={{ background: 'var(--bg1)', border: '1px solid rgba(220,38,38,.4)', color: '#fca5a5' }}
      >
        Modelos no disponibles — reintentar
      </button>
    )
  }

  const cargando = !catalogo

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        disabled={cargando}
        onClick={() => setAbierto((v) => !v)}
        onKeyDown={teclas}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className="flex min-w-[15rem] items-center gap-2 rounded-lg px-3 py-1.5 text-sm outline-none transition disabled:opacity-50"
        style={{ background: 'var(--bg1)', border: '1px solid var(--border)', color: 'var(--ink)' }}
      >
        <span className="truncate">{cargando ? 'Cargando modelos…' : actual?.etiqueta ?? value}</span>
        {actual && (
          <span
            className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
            style={{ background: 'var(--bg2)', color: 'var(--ink-soft)' }}
          >
            {badgeDe(actual)}
          </span>
        )}
        <ChevronDown size={14} className="shrink-0" style={{ color: 'var(--ink-soft)' }} />
      </button>

      {abierto && grupoActivo && (
        <div
          onKeyDown={teclas}
          // Ancla por abajo: el panel sube desde el trigger en vez de empujar
          // hacia el borde inferior de la tarjeta.
          className="absolute bottom-full left-0 z-50 mb-2 w-[34rem] max-w-[85vw] rounded-xl p-2 shadow-2xl"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
        >
          {/* Toggle de categorías */}
          <div
            role="tablist"
            className="flex gap-1 rounded-lg p-1"
            style={{ background: 'var(--bg1)' }}
          >
            {grupos.map((grupo) => {
              const Icono = ICONO_CATEGORIA[grupo.categoria]
              const activa = grupo.categoria === grupoActivo.categoria
              return (
                <button
                  key={grupo.categoria}
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  onClick={() => setTab(grupo.categoria)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition"
                  style={{
                    background: activa ? 'var(--bg2)' : 'transparent',
                    color: activa ? 'var(--ink)' : 'var(--ink-soft)',
                    boxShadow: activa ? '0 1px 3px rgba(0,0,0,.15)' : 'none',
                  }}
                >
                  <Icono size={12} />
                  {grupo.titulo}
                  <span style={{ color: 'var(--ink-soft)' }}>{grupo.modelos.length}</span>
                </button>
              )
            })}
          </div>

          {/* Modelos de la categoría activa, en 2 columnas */}
          <ul role="listbox" className="mt-2 grid grid-cols-2 gap-1">
            {grupoActivo.modelos.map((modelo) => {
              const indice = seleccionables.findIndex((m) => m.id === modelo.id)
              const resaltado = modelo.disponible && indice === activo
              const elegido = modelo.id === value
              return (
                <li
                  key={modelo.id}
                  ref={(el) => {
                    if (indice >= 0) opcionesRef.current[indice] = el
                  }}
                  role="option"
                  aria-selected={elegido}
                  aria-disabled={!modelo.disponible}
                  onClick={() => elegir(modelo)}
                  onMouseEnter={() => indice >= 0 && setActivo(indice)}
                  className={`rounded-lg px-2.5 py-2 ${
                    modelo.disponible ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
                  }`}
                  style={{
                    background: resaltado ? 'var(--bg1)' : 'transparent',
                    border: `1px solid ${elegido ? 'var(--accent)' : 'transparent'}`,
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <Check
                      size={13}
                      className="shrink-0"
                      style={{ color: elegido ? 'var(--accent)' : 'transparent' }}
                    />
                    <span className="truncate text-sm" style={{ color: 'var(--ink)' }}>
                      {modelo.etiqueta}
                    </span>
                    <span
                      className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                      style={{ background: 'var(--bg1)', color: 'var(--ink-soft)' }}
                    >
                      {badgeDe(modelo)}
                    </span>
                  </div>
                  <p className="mt-0.5 pl-[1.15rem] text-xs leading-snug" style={{ color: 'var(--ink-soft)' }}>
                    {modelo.disponible ? modelo.descripcion : 'Falta configurar su API key.'}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export default SelectorModelo

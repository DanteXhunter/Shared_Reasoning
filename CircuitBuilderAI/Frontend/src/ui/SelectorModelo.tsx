import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Check, Cloud, Gift, HardDrive, Lock, HelpCircle, type LucideIcon } from 'lucide-react'
import {
  obtenerProveedores,
  badgeDe,
  type Categoria,
  type CatalogoProveedores,
  type GrupoProveedores,
  type ModeloProveedor,
  type Rol,
} from '../api/proveedores'
import type { ModelosDisponiblesUsuario } from '../api/auth'

type Props = {
  value: string
  onChange: (id: string) => void
  // Filtra el catálogo a los modelos que sirven para este rol (visión lee la
  // imagen; razón resuelve el planner y el chat). Dos instancias de este
  // componente con rol distinto son dos selectores independientes.
  rol: Rol
  // Resultado de GET /auth/modelos-disponibles (ver Bienvenida.tsx, que lo
  // pide una sola vez para ambos selectores). Si el usuario tiene su propia
  // key para el proveedor de un modelo, la disponibilidad depende SOLO de
  // esa key (aunque el servidor también tenga una configurada); si no,
  // aplica el flag `disponible` que ya manda /proveedores.
  disponibilidadUsuario?: ModelosDisponiblesUsuario | null
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
function SelectorModelo({ value, onChange, rol, disponibilidadUsuario }: Props) {
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
      // hay uno elegido. El default global puede no servir para este rol (ej.
      // un modelo solo-visión no sirve como razonador), así que se valida
      // contra el catálogo ya filtrado antes de adoptarlo — si no aplica, cae
      // al primer modelo que sí tenga este rol.
      if (!value) {
        const conRol = datos.grupos.flatMap((g) => g.modelos).filter((m) => m.roles.includes(rol))
        const candidato = conRol.find((m) => m.id === datos.por_defecto) ?? conRol[0]
        if (candidato) onChange(candidato.id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar modelos.')
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Solo se muestran las categorías que traen modelos aplicables a este rol.
  const grupos: GrupoProveedores[] = useMemo(
    () =>
      (catalogo?.grupos ?? [])
        .map((g) => ({ ...g, modelos: g.modelos.filter((m) => m.roles.includes(rol)) }))
        .filter((g) => g.modelos.length > 0),
    [catalogo, rol],
  )

  const todos = useMemo(() => grupos.flatMap((g) => g.modelos), [grupos])

  const actual: ModeloProveedor | undefined = useMemo(
    () => todos.find((m) => m.id === value),
    [todos, value],
  )

  const grupoActivo = useMemo(
    () => grupos.find((g) => g.categoria === tab) ?? grupos[0],
    [grupos, tab],
  )

  // Si el usuario tiene su propia key para el proveedor de este modelo, el
  // estado real es el que confirmó esa key (GET /auth/modelos-disponibles),
  // no el flag genérico del servidor. Sin key propia para ese grupo, se cae
  // al flag de siempre (comportamiento anterior a este feature, intacto).
  // "sin_verificar" (solo Gemini de pago hoy, ver api/auth.ts): no se puede
  // confirmar por adelantado si la key tiene facturación — se deja elegible
  // (podría funcionar) pero con aviso, en vez de mostrarlo como confirmado.
  function estadoDe(modelo: ModeloProveedor): 'disponible' | 'bloqueado' | 'sin_verificar' {
    const propia = modelo.grupo_credencial ? disponibilidadUsuario?.[modelo.grupo_credencial] : undefined
    if (!propia) return modelo.disponible ? 'disponible' : 'bloqueado'
    if (propia.confirmados.includes(modelo.id)) return 'disponible'
    if (propia.sin_verificar.includes(modelo.id)) return 'sin_verificar'
    return 'bloqueado'
  }

  // La navegación por teclado se limita a la categoría visible.
  const seleccionables = useMemo(
    () => (grupoActivo?.modelos ?? []).filter((m) => estadoDe(m) !== 'bloqueado'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grupoActivo, disponibilidadUsuario],
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
    if (estadoDe(modelo) === 'bloqueado') return
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
        {actual && estadoDe(actual) === 'sin_verificar' && (
          <span title="No podemos confirmar de antemano si tu API key tiene facturación para este modelo — se sabrá hasta el primer uso real.">
            <HelpCircle size={13} className="shrink-0" style={{ color: 'var(--ink-soft)' }} />
          </span>
        )}
        <span className="flex-1 truncate">{cargando ? 'Cargando modelos…' : actual?.etiqueta ?? value}</span>
        {actual && estadoDe(actual) !== 'sin_verificar' && (
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
              const estado = estadoDe(modelo)
              const indice = seleccionables.findIndex((m) => m.id === modelo.id)
              const resaltado = estado !== 'bloqueado' && indice === activo
              const elegido = modelo.id === value
              // Bloqueado por dos causas distintas: sin key propia configurada
              // para este proveedor, vs. key propia configurada pero sin
              // acceso confirmado a este modelo (ver estadoDe).
              const tieneKeyPropia = modelo.grupo_credencial
                ? Boolean(disponibilidadUsuario?.[modelo.grupo_credencial])
                : false
              return (
                <li
                  key={modelo.id}
                  ref={(el) => {
                    if (indice >= 0) opcionesRef.current[indice] = el
                  }}
                  role="option"
                  aria-selected={elegido}
                  aria-disabled={estado === 'bloqueado'}
                  onClick={() => elegir(modelo)}
                  onMouseEnter={() => indice >= 0 && setActivo(indice)}
                  className={`rounded-lg px-2.5 py-2 ${
                    estado === 'bloqueado' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                  }`}
                  style={{
                    background: resaltado ? 'var(--bg1)' : 'transparent',
                    border: `1px solid ${elegido ? 'var(--accent)' : 'transparent'}`,
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    {estado === 'disponible' ? (
                      <Check
                        size={13}
                        className="shrink-0"
                        style={{ color: elegido ? 'var(--accent)' : 'transparent' }}
                      />
                    ) : estado === 'sin_verificar' ? (
                      // El title en un <svg> no dispara el tooltip nativo en los
                      // navegadores (a diferencia de un elemento HTML normal) —
                      // por eso el atributo va en este <span> que lo envuelve.
                      <span
                        className="shrink-0"
                        title="No podemos confirmar de antemano si tu API key tiene facturación para este modelo — se sabrá hasta el primer uso real."
                      >
                        <HelpCircle size={13} style={{ color: 'var(--ink-soft)' }} />
                      </span>
                    ) : (
                      <Lock size={13} className="shrink-0" style={{ color: 'var(--ink-soft)' }} />
                    )}
                    <span className="truncate text-sm" style={{ color: 'var(--ink)' }}>
                      {modelo.etiqueta}
                    </span>
                    {/* Sin el badge de costo/cuota cuando no se puede verificar: no
                        hay forma de confirmar que ese dato aplique de verdad a esta key. */}
                    {estado !== 'sin_verificar' && (
                      <span
                        className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                        style={{ background: 'var(--bg1)', color: 'var(--ink-soft)' }}
                      >
                        {badgeDe(modelo)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 pl-[1.15rem] text-xs leading-snug" style={{ color: 'var(--ink-soft)' }}>
                    {estado === 'disponible'
                      ? modelo.descripcion
                      : estado === 'sin_verificar'
                        ? 'Sin verificar — pasa el mouse sobre el ícono para más detalle.'
                        : tieneKeyPropia
                          ? 'Tu API key no tiene acceso a este modelo.'
                          : 'Falta configurar su API key.'}
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

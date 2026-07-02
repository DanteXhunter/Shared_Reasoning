import type { Instruccion } from '../circuit/types'

// Color de cable (nombre en español → hex) para el puntito indicador.
function colorHex(nombre: string): string {
  const c = (nombre ?? '').toLowerCase()
  if (c.includes('amarillo')) return '#eab308'
  if (c.includes('negro')) return '#1f2937'
  if (c.includes('rojo')) return '#dc2626'
  if (c.includes('azul')) return '#2563eb'
  if (c.includes('verde')) return '#16a34a'
  if (c.includes('naranja')) return '#ea580c'
  if (c.includes('blanco')) return '#e5e7eb'
  return '#16a34a'
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 rounded-md bg-slate-950/40 border border-white/10 text-[11px] text-slate-300 font-mono">
      {children}
    </span>
  )
}

function Paso({ ins }: { ins: Instruccion }) {
  const esCable = ins.tipo === 'conectar_cable'

  return (
    <div className="flex gap-3">
      {/* Avatar / número de paso */}
      <span className="grid place-items-center w-8 h-8 rounded-full shrink-0 text-xs font-bold shadow-lg
                       bg-gradient-to-br from-violet-500 to-indigo-600 shadow-violet-950/40">
        {ins.numero}
      </span>

      {/* Burbuja */}
      <div className="flex-1 glass border border-white/10 rounded-2xl rounded-tl-sm p-3 shadow-lg shadow-black/20">
        {/* Encabezado */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-base">{esCable ? '🔌' : '🧩'}</span>
          {esCable ? (
            <>
              <span className="font-semibold text-sm">Conectar cable</span>
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <span className="w-3 h-3 rounded-full border border-white/20" style={{ background: colorHex(ins.cable?.color ?? '') }} />
                {ins.cable?.color}
              </span>
            </>
          ) : (
            <>
              <span className="font-semibold text-sm">Colocar {ins.componente_id}</span>
              <span className="text-xs text-slate-400">
                {ins.componente_tipo}{ins.componente_valor ? ` · ${ins.componente_valor}` : ''}
              </span>
            </>
          )}
        </div>

        {/* Descripción (texto de la IA) */}
        <p className="text-sm text-slate-300 leading-relaxed mb-2">{ins.descripcion}</p>

        {/* Coordenadas */}
        <div className="flex flex-wrap items-center gap-1.5">
          {esCable && ins.cable ? (
            <>
              <Chip>fila {ins.cable.desde.fila}, col {ins.cable.desde.columna}</Chip>
              <span className="text-slate-500">→</span>
              <Chip>fila {ins.cable.hasta.fila}, col {ins.cable.hasta.columna}</Chip>
            </>
          ) : (
            ins.pines?.map((p) => (
              <Chip key={p.nombre}>{p.nombre}: fila {p.fila}, col {p.columna}</Chip>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function InstruccionesView({ instrucciones }: { instrucciones: Instruccion[] }) {
  return (
    <div className="space-y-3">
      {instrucciones.map((ins) => (
        <Paso key={ins.numero} ins={ins} />
      ))}
    </div>
  )
}

export default InstruccionesView

import TemaProvider from './theme'
import { BlobMascota } from './Logo'
import type { Nivel } from './tipos'

type Props = { onElegir: (nivel: Nivel) => void }

// Descriptores autoreportados concretos (§4.B, §8.B) — no es un cuestionario
// de verificación, es un prior: el usuario se reconoce en una de las 3.
// "Intermedio" queda comentado momentáneamente (a pedido de Diego,
// 2026-07-16) — el tipo Nivel y el resto del backend lo siguen soportando
// igual, solo no se ofrece en esta encuesta por ahora. Descomentar para restaurarlo.
const NIVELES: { id: Nivel; titulo: string; descripcion: string }[] = [
  {
    id: 'basico',
    titulo: 'Básico',
    descripcion:
      'No tienes conocimiento sobre componentes electrónicos y nunca has armado una protoboard. Es tu primera vez y quieres intentarlo.',
  },
  // {
  //   id: 'intermedio',
  //   titulo: 'Intermedio',
  //   descripcion:
  //     'Sabes qué es una resistencia, un LED, y has armado una protoboard un par de veces.',
  // },
  {
    id: 'experto',
    titulo: 'Experto',
    descripcion:
      'Puedes crear, resolver y manipular problemas eléctricos por tu cuenta, sin necesitar mucha guía.',
  },
]

// Encuesta de nivel: 3 cards grandes, el detalle se revela al pasar el mouse.
function EncuestaNivel({ onElegir }: Props) {
  return (
    <TemaProvider tema="light" className="min-h-screen" style={{ background: 'var(--bg1)', color: 'var(--ink)' }}>
      <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-8">
        <div className="flex items-center gap-4">
          <BlobMascota size={72} />
          <div
            className="rounded-3xl rounded-bl-md px-5 py-3 text-lg font-semibold shadow-lg"
            style={{ background: 'var(--bg2)', color: 'var(--ink)' }}
          >
            ¡Elige tu nivel!
          </div>
        </div>

        <div className={`grid grid-cols-1 ${NIVELES.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-6 w-full max-w-5xl`}>
          {NIVELES.map((n) => (
            <button
              key={n.id}
              onClick={() => onElegir(n.id)}
              className="group relative rounded-3xl p-8 text-left shadow-lg overflow-hidden transition hover:-translate-y-1 hover:shadow-2xl min-h-[220px] flex flex-col"
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
            >
              <h3 className="text-2xl font-extrabold mb-2" style={{ color: 'var(--accent)' }}>
                {n.titulo}
              </h3>
              <p
                className="text-sm leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ color: 'var(--ink-soft)' }}
              >
                {n.descripcion}
              </p>
              <span className="mt-auto pt-4 text-xs font-semibold opacity-60 group-hover:opacity-0 transition-opacity" style={{ color: 'var(--ink-soft)' }}>
                Pasa el mouse para ver el detalle →
              </span>
            </button>
          ))}
        </div>
      </div>
    </TemaProvider>
  )
}

export default EncuestaNivel

import TemaProvider from './theme'
import { BlobMascota } from './Logo'

type Props = { onContinuar: () => void }

// Blob se presenta antes del login (recomendación UX: humaniza el muro de
// autenticación — ver conversación 2026-07-06). Siempre en modo claro,
// tal como lo definió el mockup de diseño.
function Intro({ onContinuar }: Props) {
  return (
    <TemaProvider tema="light" className="min-h-screen" style={{ background: 'var(--bg1)', color: 'var(--ink)' }}>
      <div className="min-h-screen grid place-items-center p-6">
        <div className="flex flex-col items-center gap-10 max-w-lg text-center">
          <div className="flex items-center gap-6">
            <BlobMascota size={140} />
            <div
              className="relative rounded-3xl rounded-bl-md px-6 py-5 text-lg font-semibold shadow-lg"
              style={{ background: 'var(--bg2)', color: 'var(--ink)' }}
            >
              ¡Hola, me llamo Blob!
              <br />
              Te estaré acompañando en tu proceso de aprendizaje.
            </div>
          </div>

          <button
            onClick={onContinuar}
            className="w-full max-w-xs px-8 py-3 rounded-full font-bold text-lg shadow-lg hover:brightness-105 active:scale-[0.98] transition"
            style={{ background: 'var(--accent)', color: 'var(--bg2)' }}
          >
            Continuar
          </button>
        </div>
      </div>
    </TemaProvider>
  )
}

export default Intro

import { useState } from 'react'
import TemaProvider from './theme'
import { LogoWordmark } from './Logo'

type Props = { onEntrar: () => void }

// Login/registro — cascarón visual (issues #84/#85: auth real aún no existe
// en el backend). "Entrar" simplemente avanza el flujo.
function Auth({ onEntrar }: Props) {
  const [tab, setTab] = useState<'login' | 'registro'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const inputClass =
    'w-full rounded-xl px-4 py-3 text-sm outline-none transition'

  return (
    <TemaProvider tema="light" className="min-h-screen" style={{ background: 'var(--bg1)', color: 'var(--ink)' }}>
      <div className="min-h-screen grid place-items-center p-6">
        <div
          className="w-full max-w-sm rounded-3xl p-8 shadow-xl"
          style={{ background: 'var(--bg2)' }}
        >
          <div className="flex justify-center mb-6">
            <LogoWordmark height={36} />
          </div>

          {/* Tabs */}
          <div className="flex rounded-full p-1 mb-6" style={{ background: 'var(--bg1)' }}>
            <button
              onClick={() => setTab('login')}
              className="flex-1 py-2 rounded-full text-sm font-semibold transition"
              style={tab === 'login' ? { background: 'var(--accent)', color: 'var(--bg2)' } : { color: 'var(--ink-soft)' }}
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => setTab('registro')}
              className="flex-1 py-2 rounded-full text-sm font-semibold transition"
              style={tab === 'registro' ? { background: 'var(--accent)', color: 'var(--bg2)' } : { color: 'var(--ink-soft)' }}
            >
              Crear cuenta
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              onEntrar()
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--ink-soft)' }}>Correo Electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                style={{ background: 'var(--bg1)', color: 'var(--ink)' }}
              />
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--ink-soft)' }}>Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                style={{ background: 'var(--bg1)', color: 'var(--ink)' }}
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-full font-bold shadow-lg hover:brightness-105 active:scale-[0.98] transition"
              style={{ background: 'var(--accent)', color: 'var(--bg2)' }}
            >
              {tab === 'login' ? 'Entrar a la mesa de trabajo' : 'Crear cuenta y entrar'}
            </button>
          </form>
        </div>
      </div>
    </TemaProvider>
  )
}

export default Auth

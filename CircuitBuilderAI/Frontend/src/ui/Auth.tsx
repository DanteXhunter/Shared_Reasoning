import { useState } from 'react'
import TemaProvider from './theme'
import { LogoWordmark } from './Logo'
import { registrar, login, type Usuario } from '../api/auth'

type Props = { onEntrar: (usuario: Usuario) => void }

// Login/registro conectados a /auth/registro y /auth/login (#84/#85).
function Auth({ onEntrar }: Props) {
  const [tab, setTab] = useState<'login' | 'registro'>('login')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const inputClass =
    'w-full rounded-xl px-4 py-3 text-sm outline-none transition'

  async function enviar() {
    setError('')

    if (!email.trim() || !password) {
      setError('Completa correo y contraseña.')
      return
    }
    if (tab === 'registro' && !nombre.trim()) {
      setError('Completa tu nombre.')
      return
    }

    setCargando(true)
    try {
      const usuario =
        tab === 'login'
          ? await login(email.trim(), password)
          : await registrar(nombre.trim(), email.trim(), password)
      onEntrar(usuario)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ocurrió un error inesperado.')
    } finally {
      setCargando(false)
    }
  }

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
              enviar()
            }}
            className="space-y-4"
          >
            {tab === 'registro' && (
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'var(--ink-soft)' }}>Nombre</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className={inputClass}
                  style={{ background: 'var(--bg1)', color: 'var(--ink)' }}
                />
              </div>
            )}
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
              {tab === 'registro' && (
                <p className="text-xs mt-1.5" style={{ color: 'var(--ink-soft)' }}>
                  Mínimo 12 caracteres, con mayúscula, minúscula y número.
                </p>
              )}
            </div>

            {error && (
              <div
                className="rounded-xl px-3 py-2 text-sm flex items-start gap-2"
                style={{ background: 'rgba(220,38,38,.12)', border: '1px solid rgba(220,38,38,.4)', color: '#fca5a5' }}
              >
                <span>⚠️</span><span className="whitespace-pre-line">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={cargando}
              className="w-full py-3 rounded-full font-bold shadow-lg hover:brightness-105 active:scale-[0.98] transition disabled:opacity-60"
              style={{ background: 'var(--accent)', color: 'var(--bg2)' }}
            >
              {cargando
                ? 'Un momento...'
                : tab === 'login'
                  ? 'Entrar a la mesa de trabajo'
                  : 'Crear cuenta y entrar'}
            </button>
          </form>
        </div>
      </div>
    </TemaProvider>
  )
}

export default Auth

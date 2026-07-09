import { useState } from 'react'
import { LogOut, X, Check } from 'lucide-react'
import { actualizarPerfil, cambiarContrasena, type Usuario } from '../api/auth'

type Props = {
  usuario: Usuario
  onActualizar: (u: Usuario) => void
  onCerrarSesion: () => void
}

type Aviso = { tipo: 'ok' | 'error'; texto: string } | null

// Botón de cuenta (avatar + nombre) para el pie del sidebar + modal con el CRUD
// de perfil: ver correo, cambiar nombre/correo, cambiar contraseña y cerrar
// sesión. Solo usa endpoints que existen en el backend (#71/#73).
function PanelUsuario({ usuario, onActualizar, onCerrarSesion }: Props) {
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="flex items-center gap-3 px-3 py-2 rounded-xl transition hover:brightness-95 w-full"
        style={{ border: '1px solid var(--border)' }}
        title="Mi cuenta"
      >
        <span
          className="grid place-items-center w-8 h-8 rounded-full shrink-0 text-sm font-semibold"
          style={{ background: 'var(--accent)', color: 'var(--bg2)' }}
        >
          {usuario.nombre.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 text-left">
          <span className="block text-sm font-medium truncate">{usuario.nombre}</span>
          <span className="block text-xs truncate" style={{ color: 'var(--ink-soft)' }}>{usuario.email}</span>
        </span>
      </button>

      {abierto && (
        <ModalCuenta
          usuario={usuario}
          onActualizar={onActualizar}
          onCerrarSesion={onCerrarSesion}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </>
  )
}

function ModalCuenta({
  usuario,
  onActualizar,
  onCerrarSesion,
  onCerrar,
}: Props & { onCerrar: () => void }) {
  const [nombre, setNombre] = useState(usuario.nombre)
  const [email, setEmail] = useState(usuario.email)
  const [avisoPerfil, setAvisoPerfil] = useState<Aviso>(null)
  const [guardandoPerfil, setGuardandoPerfil] = useState(false)

  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [avisoPass, setAvisoPass] = useState<Aviso>(null)
  const [guardandoPass, setGuardandoPass] = useState(false)

  const perfilCambiado = nombre.trim() !== usuario.nombre || email.trim() !== usuario.email

  async function guardarPerfil() {
    setAvisoPerfil(null)
    setGuardandoPerfil(true)
    try {
      const actualizado = await actualizarPerfil({ nombre: nombre.trim(), email: email.trim() })
      onActualizar(actualizado)
      setAvisoPerfil({ tipo: 'ok', texto: 'Datos actualizados.' })
    } catch (e) {
      setAvisoPerfil({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar.' })
    } finally {
      setGuardandoPerfil(false)
    }
  }

  async function guardarPass() {
    setAvisoPass(null)
    setGuardandoPass(true)
    try {
      await cambiarContrasena(actual, nueva)
      setActual('')
      setNueva('')
      setAvisoPass({ tipo: 'ok', texto: 'Contraseña cambiada.' })
    } catch (e) {
      setAvisoPass({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo cambiar.' })
    } finally {
      setGuardandoPass(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'rgba(0,0,0,.4)' }} onClick={onCerrar}>
      <div
        className="w-full max-w-md rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--ink)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mi cuenta</h2>
          <button onClick={onCerrar} className="grid place-items-center w-8 h-8 rounded-lg hover:bg-black/5 transition" title="Cerrar">
            <X size={18} />
          </button>
        </div>

        {/* ---- Perfil: nombre + correo ---- */}
        <section className="space-y-3">
          <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--ink-soft)' }}>Perfil</p>
          <Campo etiqueta="Nombre" value={nombre} onChange={setNombre} />
          <Campo etiqueta="Correo" value={email} onChange={setEmail} type="email" />
          {avisoPerfil && <AvisoLinea aviso={avisoPerfil} />}
          <button
            onClick={guardarPerfil}
            disabled={!perfilCambiado || !nombre.trim() || !email.trim() || guardandoPerfil}
            className="px-4 py-2 rounded-xl accent-bg text-white text-sm font-medium disabled:opacity-40 transition hover:brightness-110"
          >
            {guardandoPerfil ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </section>

        <div style={{ borderTop: '1px solid var(--border)' }} />

        {/* ---- Contraseña ---- */}
        <section className="space-y-3">
          <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--ink-soft)' }}>Contraseña</p>
          <Campo etiqueta="Contraseña actual" value={actual} onChange={setActual} type="password" />
          <Campo etiqueta="Nueva contraseña" value={nueva} onChange={setNueva} type="password" />
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Mínimo 12 caracteres, con mayúscula, minúscula y número.</p>
          {avisoPass && <AvisoLinea aviso={avisoPass} />}
          <button
            onClick={guardarPass}
            disabled={!actual || !nueva || guardandoPass}
            className="px-4 py-2 rounded-xl accent-bg text-white text-sm font-medium disabled:opacity-40 transition hover:brightness-110"
          >
            {guardandoPass ? 'Cambiando…' : 'Cambiar contraseña'}
          </button>
        </section>

        <div style={{ borderTop: '1px solid var(--border)' }} />

        <button
          onClick={onCerrarSesion}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition hover:bg-black/5"
          style={{ border: '1px solid var(--border)', color: '#dc2626' }}
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

function Campo({
  etiqueta,
  value,
  onChange,
  type = 'text',
}: {
  etiqueta: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <label className="block">
      <span className="block text-xs mb-1" style={{ color: 'var(--ink-soft)' }}>{etiqueta}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl px-3 py-2 text-sm outline-none"
        style={{ background: 'var(--bg1)', border: '1px solid var(--border)', color: 'var(--ink)' }}
      />
    </label>
  )
}

function AvisoLinea({ aviso }: { aviso: NonNullable<Aviso> }) {
  const ok = aviso.tipo === 'ok'
  return (
    <div
      className="rounded-xl px-3 py-2 text-sm flex items-start gap-2"
      style={
        ok
          ? { background: 'rgba(22,163,74,.12)', border: '1px solid rgba(22,163,74,.4)', color: '#16a34a' }
          : { background: 'rgba(220,38,38,.12)', border: '1px solid rgba(220,38,38,.4)', color: '#dc2626' }
      }
    >
      <span className="shrink-0 mt-0.5">{ok ? <Check size={15} /> : '⚠️'}</span>
      <span className="whitespace-pre-line">{aviso.texto}</span>
    </div>
  )
}

export default PanelUsuario

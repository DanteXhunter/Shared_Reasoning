import { useRef, useState } from 'react'
import { LogOut, X, Check, Upload, Trash2 } from 'lucide-react'
import { actualizarPerfil, cambiarContrasena, type Usuario } from '../api/auth'
import Avatar from './Avatar'
import ConfiguracionApiKeys from './ConfiguracionApiKeys'
import { AVATARES_PRESET } from './avatares'
import { comprimirImagen } from './imagenUtil'

// Lado máximo de la foto ya procesada — cualquier imagen que subas se reduce
// a esto (nunca se rechaza por pesada: la comprimimos nosotros). 512px y
// calidad 0.82 en JPEG dan tamaños de archivo típicos de 30-90KB, muy por
// debajo del límite de 500_000 caracteres que acepta el backend en foto_perfil.
const FOTO_LADO_MAX = 512
const FOTO_CALIDAD = 0.82

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Props = {
  usuario: Usuario
  onActualizar: (u: Usuario) => void
  onCerrarSesion: () => void
}

type Aviso = { tipo: 'ok' | 'error'; texto: string } | null

// Mismas reglas que ContrasenaRequest en el backend (auth.py) — validar acá
// evita el viaje redondo al servidor solo para enterarse de un error de
// formato, y el usuario ve el problema mientras escribe, no después de enviar.
function erroresContrasena(valor: string): string[] {
  const errores: string[] = []
  if (valor.length < 12) errores.push('mínimo 12 caracteres')
  if (!/[A-Z]/.test(valor)) errores.push('al menos una mayúscula')
  if (!/[a-z]/.test(valor)) errores.push('al menos una minúscula')
  if (!/[0-9]/.test(valor)) errores.push('al menos un número')
  return errores
}

// Botón de cuenta (avatar + nombre) para el pie del sidebar de Bienvenida +
// modal "Mi cuenta". El mismo modal (ModalCuenta) lo reutiliza VistaPrincipal
// desde su propio botón de topbar — un solo lugar con el CRUD de perfil,
// contraseña, API keys propias y foto de perfil, sin importar desde qué
// pantalla se abra.
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
        <Avatar usuario={usuario} size={32} />
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

export function ModalCuenta({
  usuario,
  onActualizar,
  onCerrarSesion,
  onCerrar,
}: Props & { onCerrar: () => void }) {
  const [nombre, setNombre] = useState(usuario.nombre)
  const [email, setEmail] = useState(usuario.email)
  const [avisoPerfil, setAvisoPerfil] = useState<Aviso>(null)
  const [guardandoPerfil, setGuardandoPerfil] = useState(false)

  // Foto de perfil: se aplica al instante (elegir personaje o subir), sin
  // compartir botón con nombre/correo — un clic, un cambio, una confirmación.
  const [avisoFoto, setAvisoFoto] = useState<Aviso>(null)
  const [guardandoFoto, setGuardandoFoto] = useState(false)
  const inputFotoRef = useRef<HTMLInputElement>(null)

  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmarNueva, setConfirmarNueva] = useState('')
  const [avisoPass, setAvisoPass] = useState<Aviso>(null)
  const [guardandoPass, setGuardandoPass] = useState(false)

  const emailValido = EMAIL_REGEX.test(email.trim())
  const perfilCambiado = nombre.trim() !== usuario.nombre || email.trim() !== usuario.email

  const problemasNueva = nueva ? erroresContrasena(nueva) : []
  const nuevaCoincide = nueva === confirmarNueva
  const passwordValida = actual.length > 0 && nueva.length > 0 && problemasNueva.length === 0 && nuevaCoincide

  async function guardarPerfil() {
    setAvisoPerfil(null)
    if (!nombre.trim()) {
      setAvisoPerfil({ tipo: 'error', texto: 'El nombre no puede quedar vacío.' })
      return
    }
    if (!emailValido) {
      setAvisoPerfil({ tipo: 'error', texto: 'Escribe un correo con formato válido (ej. nombre@dominio.com).' })
      return
    }
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
    if (problemasNueva.length > 0) {
      setAvisoPass({ tipo: 'error', texto: `A la nueva contraseña le falta: ${problemasNueva.join(', ')}.` })
      return
    }
    if (!nuevaCoincide) {
      setAvisoPass({ tipo: 'error', texto: 'La confirmación no coincide con la nueva contraseña.' })
      return
    }
    if (nueva === actual) {
      setAvisoPass({ tipo: 'error', texto: 'La nueva contraseña debe ser distinta a la actual.' })
      return
    }
    setGuardandoPass(true)
    try {
      await cambiarContrasena(actual, nueva)
      setActual('')
      setNueva('')
      setConfirmarNueva('')
      setAvisoPass({ tipo: 'ok', texto: 'Contraseña cambiada.' })
    } catch (e) {
      setAvisoPass({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo cambiar.' })
    } finally {
      setGuardandoPass(false)
    }
  }

  // Aplica y guarda la foto de inmediato (personaje elegido, foto subida, o
  // "Quitar foto" con valor ''). Un único punto de guardado para las tres
  // acciones del bloque de foto.
  async function aplicarFoto(valor: string) {
    setAvisoFoto(null)
    setGuardandoFoto(true)
    try {
      const actualizado = await actualizarPerfil({ fotoPerfil: valor })
      onActualizar(actualizado)
      setAvisoFoto({ tipo: 'ok', texto: valor ? 'Foto actualizada.' : 'Foto eliminada.' })
    } catch (e) {
      setAvisoFoto({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo actualizar la foto.' })
    } finally {
      setGuardandoFoto(false)
    }
  }

  async function subirFoto(archivo: File | undefined) {
    if (!archivo) return
    if (!archivo.type.startsWith('image/')) {
      setAvisoFoto({ tipo: 'error', texto: 'Elige un archivo de imagen.' })
      return
    }
    setAvisoFoto(null)
    setGuardandoFoto(true)
    try {
      const dataUrl = await comprimirImagen(archivo, FOTO_LADO_MAX, FOTO_CALIDAD)
      await aplicarFoto(dataUrl)
    } catch (e) {
      setAvisoFoto({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo procesar la imagen.' })
      setGuardandoFoto(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'rgba(0,0,0,.6)' }} onClick={onCerrar}>
      <div
        className="rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl"
        style={{ width: '70vw', minWidth: 320, background: 'var(--bg1)', border: '1px solid var(--border)', color: 'var(--ink)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mi cuenta</h2>
          <button onClick={onCerrar} className="grid place-items-center w-8 h-8 rounded-lg hover:bg-black/5 transition" title="Cerrar">
            <X size={18} />
          </button>
        </div>

        {/* ---- Foto de perfil: carrusel de personajes + foto propia (se aplica al instante) ---- */}
        <section className="space-y-3">
          <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--ink-soft)' }}>Foto de perfil</p>

          <div className="flex items-center gap-3">
            <Avatar usuario={usuario} size={56} />
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => inputFotoRef.current?.click()}
                disabled={guardandoFoto}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition hover:brightness-95 disabled:opacity-50"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
              >
                <Upload size={13} />
                {guardandoFoto ? 'Guardando…' : 'Subir tu foto'}
              </button>
              <input
                ref={inputFotoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => subirFoto(e.target.files?.[0])}
              />
              {usuario.fotoPerfil && (
                <button
                  onClick={() => aplicarFoto('')}
                  disabled={guardandoFoto}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition hover:brightness-95 disabled:opacity-50"
                  style={{ color: '#dc2626' }}
                >
                  <Trash2 size={13} />
                  Quitar foto
                </button>
              )}
            </div>
          </div>

          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>O elige un personaje (se aplica al instante):</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {AVATARES_PRESET.map((ruta) => (
              <button
                key={ruta}
                onClick={() => aplicarFoto(ruta)}
                disabled={guardandoFoto}
                className="shrink-0 rounded-full transition disabled:opacity-50"
                style={{
                  padding: 2,
                  border: usuario.fotoPerfil === ruta ? '2px solid var(--accent)' : '2px solid transparent',
                }}
                title="Elegir este personaje"
              >
                <img src={ruta} alt="" className="w-12 h-12 rounded-full object-cover" />
              </button>
            ))}
          </div>
          {avisoFoto && <AvisoLinea aviso={avisoFoto} />}
        </section>

        <div style={{ borderTop: '1px solid var(--border)' }} />

        {/* ---- Perfil: nombre + correo ---- */}
        <section className="space-y-3">
          <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--ink-soft)' }}>Perfil</p>
          <Campo etiqueta="Nombre" value={nombre} onChange={setNombre} />
          <Campo etiqueta="Correo" value={email} onChange={setEmail} type="email" />
          {email.trim() && !emailValido && (
            <p className="text-xs" style={{ color: '#dc2626' }}>El correo no tiene un formato válido.</p>
          )}
          {avisoPerfil && <AvisoLinea aviso={avisoPerfil} />}
          <button
            onClick={guardarPerfil}
            disabled={!perfilCambiado || !nombre.trim() || !emailValido || guardandoPerfil}
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
          <Campo etiqueta="Confirmar nueva contraseña" value={confirmarNueva} onChange={setConfirmarNueva} type="password" />
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Mínimo 12 caracteres, con mayúscula, minúscula y número.</p>
          {nueva && problemasNueva.length > 0 && (
            <p className="text-xs" style={{ color: '#dc2626' }}>Falta: {problemasNueva.join(', ')}.</p>
          )}
          {nueva && confirmarNueva && !nuevaCoincide && (
            <p className="text-xs" style={{ color: '#dc2626' }}>Las contraseñas no coinciden.</p>
          )}
          {avisoPass && <AvisoLinea aviso={avisoPass} />}
          <button
            onClick={guardarPass}
            disabled={!passwordValida || guardandoPass}
            className="px-4 py-2 rounded-xl accent-bg text-white text-sm font-medium disabled:opacity-40 transition hover:brightness-110"
          >
            {guardandoPass ? 'Cambiando…' : 'Cambiar contraseña'}
          </button>
        </section>

        <div style={{ borderTop: '1px solid var(--border)' }} />

        {/* ---- API keys propias ---- */}
        <section className="space-y-3">
          <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--ink-soft)' }}>API keys propias</p>
          <ConfiguracionApiKeys usuario={usuario} onActualizar={onActualizar} />
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
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--ink)' }}
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

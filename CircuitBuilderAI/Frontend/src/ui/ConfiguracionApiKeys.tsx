import { useEffect, useState } from 'react'
import { KeyRound, Check } from 'lucide-react'
import { obtenerProveedores, type GrupoCredencial } from '../api/proveedores'
import { actualizarApiKeys, type Usuario } from '../api/auth'

type Props = {
  usuario: Usuario
  onActualizar: (u: Usuario) => void
}

type Aviso = { tipo: 'ok' | 'error'; texto: string } | null

// Un campo por proveedor REAL (OpenAI, Gemini, NVIDIA), no por slot
// visión/razón — así una key de Gemini nunca se manda por error a un
// endpoint de OpenAI: el backend elige la key según a qué proveedor
// pertenece el modelo que elegiste en cada SelectorModelo, sin importar en
// qué slot lo pusiste. Si dejas un campo vacío y eliges un modelo de ese
// proveedor, esa llamada usa la key compartida del servidor.
//
// Las keys se guardan cifradas en el backend (PATCH /auth/api-keys) — nunca
// vuelven al front, por eso los campos SIEMPRE arrancan vacíos; lo único que
// indica si ya hay una guardada es el badge "Configurada ✓" que viene de
// usuario.apiKeysConfiguradas.
function ConfiguracionApiKeys({ usuario, onActualizar }: Props) {
  const [grupos, setGrupos] = useState<GrupoCredencial[] | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<Aviso>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    obtenerProveedores()
      .then((c) => setGrupos(c.grupos_credencial))
      .catch(() => setErrorCarga('No se pudo cargar la lista de proveedores.'))
  }, [])

  const hayAlgoQueGuardar = Object.values(valores).some((v) => v.trim() !== '')

  async function guardar() {
    setAviso(null)
    setGuardando(true)
    try {
      // Solo se manda lo que el usuario efectivamente escribió — los campos
      // vacíos son undefined (no tocar), no "" (que borraría la key).
      const datos: { openai?: string; gemini?: string; nvidia?: string } = {}
      for (const [grupoId, valor] of Object.entries(valores)) {
        if (valor.trim()) datos[grupoId as keyof typeof datos] = valor.trim()
      }
      const actualizado = await actualizarApiKeys(datos)
      onActualizar(actualizado)
      setValores({})
      setAviso({ tipo: 'ok', texto: 'API keys guardadas.' })
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar.' })
    } finally {
      setGuardando(false)
    }
  }

  async function quitar(grupoId: string) {
    setAviso(null)
    setGuardando(true)
    try {
      const actualizado = await actualizarApiKeys({ [grupoId]: '' })
      onActualizar(actualizado)
      setAviso({ tipo: 'ok', texto: 'Key eliminada.' })
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo eliminar.' })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs flex items-start gap-2" style={{ color: 'var(--ink-soft)' }}>
        <KeyRound size={14} className="shrink-0 mt-0.5" />
        Opcional: pon tu propia API key del proveedor que quieras usar, para no
        compartir el cupo del servidor. Corre bajo tu propio costo. Se guarda
        cifrada en tu cuenta — nunca se vuelve a mostrar aquí, por eso los
        campos aparecen vacíos aunque ya tengas una guardada.
      </p>

      {errorCarga && <p className="text-xs" style={{ color: '#dc2626' }}>{errorCarga}</p>}
      {grupos === null && !errorCarga && (
        <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Cargando proveedores…</p>
      )}

      {grupos?.map((grupo) => {
        const configurada = usuario.apiKeysConfiguradas[grupo.id as keyof typeof usuario.apiKeysConfiguradas]
        return (
          <div key={grupo.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs uppercase tracking-widest" style={{ color: 'var(--ink-soft)' }}>
                API key — {grupo.etiqueta}
              </label>
              {configurada && (
                <span className="flex items-center gap-1 text-xs" style={{ color: '#16a34a' }}>
                  <Check size={12} /> Configurada
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                autoComplete="off"
                value={valores[grupo.id] ?? ''}
                onChange={(e) => setValores((v) => ({ ...v, [grupo.id]: e.target.value }))}
                placeholder={configurada ? 'Reemplazar key guardada' : `Tu API key de ${grupo.etiqueta}`}
                className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
              {configurada && (
                <button
                  onClick={() => quitar(grupo.id)}
                  disabled={guardando}
                  className="px-3 py-2 rounded-xl text-xs transition hover:brightness-95 disabled:opacity-50"
                  style={{ border: '1px solid var(--border)', color: '#dc2626' }}
                >
                  Quitar
                </button>
              )}
            </div>
          </div>
        )
      })}

      {aviso && (
        <div
          className="rounded-xl px-3 py-2 text-sm flex items-start gap-2"
          style={
            aviso.tipo === 'ok'
              ? { background: 'rgba(22,163,74,.12)', border: '1px solid rgba(22,163,74,.4)', color: '#16a34a' }
              : { background: 'rgba(220,38,38,.12)', border: '1px solid rgba(220,38,38,.4)', color: '#dc2626' }
          }
        >
          <span className="shrink-0 mt-0.5">{aviso.tipo === 'ok' ? <Check size={15} /> : '⚠️'}</span>
          <span className="whitespace-pre-line">{aviso.texto}</span>
        </div>
      )}

      <button
        onClick={guardar}
        disabled={!hayAlgoQueGuardar || guardando}
        className="px-4 py-2 rounded-xl accent-bg text-white text-sm font-medium disabled:opacity-40 transition hover:brightness-110"
      >
        {guardando ? 'Guardando…' : 'Guardar API keys'}
      </button>
    </div>
  )
}

export default ConfiguracionApiKeys

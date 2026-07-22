import { useEffect, useState } from 'react'
import TemaProvider from './theme'
import { BlobMascota } from './Logo'
import { obtenerVistaPreviaCompartida, importarSesionCompartida, abrirSesion } from '../api/sesiones'
import { obtenerProveedores } from '../api/proveedores'
import type { Sesion } from './tipos'

type Props = {
  token: string
  nivel: Sesion['nivel']
  onListo: (s: Sesion) => void
  // El usuario decide no importar (o el link resultó inválido) — sigue el flujo normal.
  onOmitir: () => void
}

type Estado = 'cargando' | 'listo' | 'importando' | 'error'

// Pantalla que resuelve un link "?compartido=<token>" (ver App.tsx): muestra
// un preview de la sesión compartida y, si el usuario confirma, se trae una
// COPIA independiente a su propia cuenta (no es edición colaborativa en vivo
// — ver modelo elegido junto a SesionCompartirResponse en main.py).
function ImportarCompartido({ token, nivel, onListo, onOmitir }: Props) {
  const [estado, setEstado] = useState<Estado>('cargando')
  const [preview, setPreview] = useState<{ nombre: string; cantidadMensajes: number } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    obtenerVistaPreviaCompartida(token)
      .then((p) => {
        setPreview({ nombre: p.nombre, cantidadMensajes: p.cantidadMensajes })
        setEstado('listo')
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Este link de circuito compartido no es válido.')
        setEstado('error')
      })
  }, [token])

  async function importar() {
    setEstado('importando')
    try {
      const proveedorPorDefecto = (await obtenerProveedores()).por_defecto
      const nuevaId = await importarSesionCompartida(token)
      const sesion = await abrirSesion(nuevaId, {
        proveedor: proveedorPorDefecto,
        proveedorRazon: proveedorPorDefecto,
        nivel,
      })
      onListo(sesion)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar el circuito compartido.')
      setEstado('error')
    }
  }

  return (
    <TemaProvider tema="light" className="min-h-screen" style={{ background: 'var(--bg1)', color: 'var(--ink)' }}>
      <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-8">
        <div className="flex items-center gap-4">
          <BlobMascota size={72} />
          <div
            className="rounded-3xl rounded-bl-md px-5 py-3 text-lg font-semibold shadow-lg"
            style={{ background: 'var(--bg2)', color: 'var(--ink)' }}
          >
            {estado === 'error' ? 'Este link no funcionó' : 'Te compartieron un circuito'}
          </div>
        </div>

        <div
          className="rounded-3xl p-8 shadow-lg w-full max-w-md flex flex-col gap-4"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
        >
          {estado === 'cargando' && (
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Cargando…</p>
          )}

          {estado === 'error' && (
            <>
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{error}</p>
              <button
                onClick={onOmitir}
                className="rounded-xl px-4 py-2 text-sm font-semibold self-start"
                style={{ background: 'var(--accent)', color: 'var(--bg2)' }}
              >
                Continuar sin importar
              </button>
            </>
          )}

          {(estado === 'listo' || estado === 'importando') && preview && (
            <>
              <h3 className="text-xl font-extrabold" style={{ color: 'var(--accent)' }}>{preview.nombre}</h3>
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                {preview.cantidadMensajes > 0
                  ? `Incluye ${preview.cantidadMensajes} mensaje${preview.cantidadMensajes === 1 ? '' : 's'} de chat.`
                  : 'Sin mensajes de chat todavía.'}
                {' '}Se agregará como una copia propia a tu historial — lo que hagas después no afecta al original.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={importar}
                  disabled={estado === 'importando'}
                  className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: 'var(--bg2)' }}
                >
                  {estado === 'importando' ? 'Agregando…' : 'Agregar a mis chats'}
                </button>
                <button
                  onClick={onOmitir}
                  disabled={estado === 'importando'}
                  className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ color: 'var(--ink-soft)' }}
                >
                  Ahora no
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </TemaProvider>
  )
}

export default ImportarCompartido

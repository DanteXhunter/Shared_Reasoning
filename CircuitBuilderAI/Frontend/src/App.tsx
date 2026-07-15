import { useEffect, useState } from 'react'
import Intro from './ui/Intro'
import Auth from './ui/Auth'
import EncuestaNivel from './ui/EncuestaNivel'
import Bienvenida from './ui/Bienvenida'
import VistaPrincipal from './ui/VistaPrincipal'
import DevApp from './DevApp'
import type { Sesion, Nivel } from './ui/tipos'
import { actualizarNivel, alExpirarSesion, borrarToken, obtenerUsuarioActual, type Usuario } from './api/auth'

type Paso = 'intro' | 'auth' | 'encuesta' | 'bienvenida' | 'principal'

// ============================================================
//  Conmutador raíz:
//   · UI oficial "Paralelo": Blob se presenta → login/registro →
//     encuesta de nivel (solo la primera vez, ver #84/#85) →
//     bienvenida (subir esquemático) → workspace.
//     (recomendación UX 2026-07-06: Blob antes del login, humaniza
//     el muro de autenticación — ver CLAUDE.md)
//   · Modo desarrollo: interfaz de prueba + biblioteca
//     (botón </>  en el riel, o abrir la app con ?dev en la URL)
// ============================================================
function App() {
  const [modoDev, setModoDev] = useState(() => new URLSearchParams(window.location.search).has('dev'))
  const [paso, setPaso] = useState<Paso>('intro')
  const [nivel, setNivel] = useState<Nivel>('intermedio')
  const [sesion, setSesion] = useState<Sesion | null>(null)
  // Usuario autenticado (nombre/correo) para el panel de cuenta del sidebar.
  // Las API keys propias del usuario ahora se guardan cifradas en el backend
  // (Mi cuenta → API keys propias) — ya no viven en el estado de App.
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  // Mientras se confirma si el token guardado sigue siendo válido, no se
  // muestra nada — evita el parpadeo de "intro" antes de decidir a dónde ir.
  const [verificandoSesion, setVerificandoSesion] = useState(true)

  function alAutenticar(usuario: Usuario) {
    setUsuario(usuario)
    setNivel(usuario.nivel)
    // La encuesta se muestra siempre que el nivel no esté confirmado todavía
    // (primera vez tras el registro, o si se quedó a medias); una vez
    // confirmado, nunca se vuelve a mostrar.
    setPaso(usuario.nivelConfirmado ? 'bienvenida' : 'encuesta')
  }

  // Si el token expira o deja de ser válido en cualquier request protegido,
  // se vuelve a pedir login sin importar en qué pantalla estaba el usuario.
  useEffect(() => {
    alExpirarSesion(() => setPaso('auth'))
  }, [])

  // Al recargar la página: si hay un token guardado y sigue siendo válido,
  // restaura la sesión sin pedir login de nuevo (no restaura el circuito que
  // se estaba armando — eso es el #73, persistencia de sesiones).
  useEffect(() => {
    obtenerUsuarioActual()
      .then((usuario) => usuario && alAutenticar(usuario))
      .finally(() => setVerificandoSesion(false))
  }, [])

  function cerrarSesion() {
    borrarToken()
    setSesion(null)
    setUsuario(null)
    setNivel('intermedio')
    setPaso('auth')
  }

  async function alElegirNivel(n: Nivel) {
    setNivel(n)
    setPaso('bienvenida')
    try {
      await actualizarNivel(n)
    } catch {
      // Si falla el guardado remoto, la sesión sigue con el nivel elegido en
      // memoria; se reintentará marcar como confirmado en el próximo login.
    }
  }

  if (verificandoSesion) return null

  if (modoDev) return <DevApp onVolver={() => setModoDev(false)} />

  if (sesion) return (
    <VistaPrincipal
      key={sesion.id ?? sesion.nombre}
      sesion={sesion}
      usuario={usuario}
      onNuevo={() => { setSesion(null); setPaso('bienvenida') }}
      onCargarSesion={setSesion}
      onCerrarSesion={cerrarSesion}
      onActualizarUsuario={setUsuario}
    />
  )

  switch (paso) {
    case 'intro':
      return <Intro onContinuar={() => setPaso('auth')} />
    case 'auth':
      return <Auth onEntrar={alAutenticar} />
    case 'encuesta':
      return <EncuestaNivel onElegir={alElegirNivel} />
    case 'bienvenida':
      return (
        <Bienvenida
          nivel={nivel}
          onListo={setSesion}
          usuario={usuario}
          onActualizarUsuario={setUsuario}
          onCerrarSesion={cerrarSesion}
        />
      )
  }
}

export default App

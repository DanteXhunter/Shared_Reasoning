import { useState } from 'react'
import Intro from './ui/Intro'
import Auth from './ui/Auth'
import EncuestaNivel from './ui/EncuestaNivel'
import Bienvenida from './ui/Bienvenida'
import VistaPrincipal from './ui/VistaPrincipal'
import DevApp from './DevApp'
import type { Sesion, Nivel } from './ui/tipos'

type Paso = 'intro' | 'auth' | 'encuesta' | 'bienvenida' | 'principal'

// ============================================================
//  Conmutador raíz:
//   · UI oficial "Paralelo": Blob se presenta → login/registro →
//     encuesta de nivel → bienvenida (subir esquemático) → workspace.
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

  if (modoDev) return <DevApp onVolver={() => setModoDev(false)} />

  if (sesion) return <VistaPrincipal key={sesion.nombre} sesion={sesion} onNuevo={() => { setSesion(null); setPaso('bienvenida') }} onDev={() => setModoDev(true)} onCargarSesion={setSesion} />

  switch (paso) {
    case 'intro':
      return <Intro onContinuar={() => setPaso('auth')} />
    case 'auth':
      return <Auth onEntrar={() => setPaso('encuesta')} />
    case 'encuesta':
      return <EncuestaNivel onElegir={(n) => { setNivel(n); setPaso('bienvenida') }} />
    case 'bienvenida':
      return <Bienvenida nivel={nivel} onListo={setSesion} />
  }
}

export default App

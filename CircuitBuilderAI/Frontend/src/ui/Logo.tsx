import { useTema } from './theme'

// Wordmark "PARALELO" con Blob integrado como la última O.
// logoDARK.png (morado, para fondo oscuro) / logoLIGHT.png (naranja, para fondo claro).
export function LogoWordmark({ height = 40, className }: { height?: number; className?: string }) {
  const tema = useTema()
  return (
    <img
      src={tema === 'light' ? '/logoLIGHT.png' : '/logoDARK.png'}
      alt="Paralelo"
      style={{ height }}
      className={className}
    />
  )
}

// La mascota Blob sola (pantalla de introducción, encuesta de nivel, etc.).
export function BlobMascota({ size = 64, className }: { size?: number; className?: string }) {
  const tema = useTema()
  return (
    <img
      src={tema === 'light' ? '/blopLIGHT.png' : '/blopDARK.png'}
      alt="Blob"
      style={{ width: size, height: 'auto' }}
      className={className}
    />
  )
}

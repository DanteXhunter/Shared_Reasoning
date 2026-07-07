import { createContext, useContext, type CSSProperties, type ReactNode } from 'react'

// Modos disponibles. Falta un tercer modo (aún sin paleta de diseño).
export type Tema = 'dark' | 'light'

const TemaContext = createContext<Tema>('dark')
export const useTema = () => useContext(TemaContext)

type Props = { tema: Tema; children: ReactNode; className?: string; style?: CSSProperties }

// Fija el tema (y sus variables CSS, ver index.css) para todo lo que esté dentro.
function TemaProvider({ tema, children, className, style }: Props) {
  return (
    <div data-theme={tema} className={className} style={style}>
      <TemaContext.Provider value={tema}>{children}</TemaContext.Provider>
    </div>
  )
}

export default TemaProvider

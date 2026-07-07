import { Wrench, CircleHelp, BookOpen, type LucideIcon } from 'lucide-react'
import type { Instruccion, Netlist } from '../circuit/types'

// Proveedores que el agente extractor del backend soporta.
export const PROVEEDORES = ['openai', 'nemotron', 'llama-vision']

// Qué quiere hacer el usuario con su esquemático (mini-cuestionario de la
// bienvenida cuando no escribe un prompt).
export type Intencion = 'armar' | 'pregunta' | 'entender' | 'ejemplo'

// Nivel autoreportado (§4.B, §8.B) — se elige una vez al inicio de cada sesión.
export type Nivel = 'basico' | 'intermedio' | 'experto'

export const INTENCIONES: { id: Intencion; Icono: LucideIcon; titulo: string; detalle: string }[] = [
  { id: 'armar', Icono: Wrench, titulo: 'Armarlo en la protoboard', detalle: 'Genera el paso a paso para construirlo físicamente.' },
  { id: 'pregunta', Icono: CircleHelp, titulo: 'Tengo una pregunta sobre él', detalle: 'Genera el plan y deja tu duda lista en el chat.' },
  { id: 'entender', Icono: BookOpen, titulo: 'Entender qué hace', detalle: 'Genera el plan y una explicación del circuito.' },
]

// Todo lo que la pantalla de bienvenida entrega a la vista principal.
export type Sesion = {
  instrucciones: Instruccion[]
  netlist: Netlist | null
  prompt: string
  intencion: Intencion
  proveedor: string
  nombre: string
  nivel: Nivel
  // Conversación precargada (chats de prueba / futuras sesiones restauradas).
  mensajes?: { de: 'ai' | 'tu'; texto: string }[]
}

import { Wrench, CircleHelp, BookOpen, type LucideIcon } from 'lucide-react'
import type { Instruccion, Netlist, Uso } from '../circuit/types'

// La lista de proveedores la sirve el backend en GET /proveedores
// (ver api/proveedores.ts). No se hardcodea aquí para que no se desincronicen.

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
  // id de la sesión en la BD (#73). Undefined si aún no se persistió.
  id?: string
  instrucciones: Instruccion[]
  netlist: Netlist | null
  prompt: string
  intencion: Intencion
  // Modelo que leyó la imagen del esquemático (extractor).
  proveedor: string
  // Modelo que resuelve el planner y el chat (clasificar, modificar,
  // responder) — puede ser distinto al de visión.
  proveedorRazon: string
  nombre: string
  nivel: Nivel
  // Data URL (base64) del esquemático subido, para mostrarlo en la pestaña
  // "Esquema". Se guarda como data URL (no object URL) para que sobreviva.
  imagenEsquema?: string
  // Conversación precargada (chats de prueba / futuras sesiones restauradas).
  mensajes?: { de: 'ai' | 'tu'; texto: string }[]
  // Consumo real persistido en la BD (columna metricas): el análisis inicial
  // (① /analizar extractor, ② /planificar) más una lista con cada interacción
  // del chat. Alimenta la pestaña "Métricas" y sobrevive a recargar/reabrir la
  // sesión. Ausente en sesiones de ejemplo (no pasaron por el backend).
  metricasProceso?: { extractor?: Uso; planner?: Uso; chat?: { uso: Uso; intencion: string }[] }
}

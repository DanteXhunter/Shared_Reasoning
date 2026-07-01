// ============================================================
//  Contrato JSON que el frontend consume para renderizar.
//  Es el "plan" descrito en CLAUDE.md §7: una sola llamada al LLM
//  produce TODOS los componentes + el paso a paso con coordenadas
//  de protoboard. Konva solo lee de aquí (render de solo lectura).
// ============================================================

// Tipos de componente que la librería Konva sabe dibujar.
// Cualquier otro string se dibuja con un placeholder genérico.
export type TipoComponente =
  | 'resistor'
  | 'resistencia'
  | 'led'
  | 'capacitor'
  | 'condensador'
  | 'wire'
  | 'cable'
  | 'battery'
  | 'bateria'

export interface ComponentePlan {
  id: string                 // "R1", "D1", "C1"...
  type: TipoComponente | string
  value?: string             // "10kΩ"
  pins: string[]             // coordenadas de protoboard: ["A5", "A9"]
  color?: string             // color opcional (LED, cable)
}

export interface PasoPlan {
  step: number               // 1-based
  action: string             // texto de la instrucción
  component: string          // id del componente que introduce este paso
  highlight?: string[]       // huecos a resaltar
  checkpoint?: boolean
  foto_requerida?: boolean
  modo_detectado?: string | null
}

export interface Plan {
  components: ComponentePlan[]
  steps: PasoPlan[]
  nivel?: 'novato' | 'intermedio' | 'experto' | string
  checkpoints_confirmados?: number[]
}

// Índice rápido id → componente, para resolver `paso.component`.
export function indexarComponentes(plan: Plan): Record<string, ComponentePlan> {
  return Object.fromEntries(plan.components.map((c) => [c.id, c]))
}

// Componentes que deben estar visibles hasta un paso dado (render acumulativo):
// todos los componentes introducidos por los pasos 1..pasoActual.
export function componentesHastaPaso(plan: Plan, pasoActual: number): ComponentePlan[] {
  const porId = indexarComponentes(plan)
  const ids = plan.steps
    .filter((p) => p.step <= pasoActual)
    .map((p) => p.component)
  // Preserva orden y evita duplicados.
  const vistos = new Set<string>()
  const resultado: ComponentePlan[] = []
  for (const id of ids) {
    if (!vistos.has(id) && porId[id]) {
      vistos.add(id)
      resultado.push(porId[id])
    }
  }
  return resultado
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type Categoria = 'pago' | 'free' | 'local'

// Para qué sirve el modelo: "vision" lee la imagen del esquemático (extractor),
// "razon" resuelve tareas de texto/JSON (planner + chat: clasificar, modificar,
// responder). Un modelo puede servir para ambos roles.
export type Rol = 'vision' | 'razon'

export type ModeloProveedor = {
  // Clave que espera el backend en el campo `proveedor`/`proveedor_razon` de
  // cada endpoint.
  id: string
  modelo: string
  etiqueta: string
  descripcion: string
  categoria: Categoria
  por_defecto: boolean
  roles: Rol[]
  // Hay API key configurada. No garantiza que la cuenta tenga saldo.
  disponible: boolean
  tipo_facturacion: 'saldo' | 'diario' | 'local' | 'desconocido'
  peticiones_dia: number | null
}

export type GrupoProveedores = {
  categoria: Categoria
  titulo: string
  modelos: ModeloProveedor[]
}

export type CatalogoProveedores = {
  grupos: GrupoProveedores[]
  por_defecto: string
}

// Endpoint público (no requiere token): el usuario elige modelo antes de entrar.
export async function obtenerProveedores(): Promise<CatalogoProveedores> {
  const res = await fetch(`${API_URL}/proveedores`)
  if (!res.ok) throw new Error('No se pudo cargar la lista de modelos.')
  return (await res.json()) as CatalogoProveedores
}

// Texto corto del costo/cuota, para el badge de cada opción.
export function badgeDe(modelo: ModeloProveedor): string {
  if (modelo.categoria === 'local') return 'local'
  if (modelo.tipo_facturacion === 'saldo') return 'saldo'
  if (modelo.peticiones_dia) return `${modelo.peticiones_dia}/día`
  return 'free'
}

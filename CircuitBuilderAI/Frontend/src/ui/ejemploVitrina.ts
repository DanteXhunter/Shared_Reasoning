import { EJEMPLO_VITRINA_COMPONENTES } from '../circuit/layout'
import type { Sesion } from './tipos'

// Sesión de QA — un componente por paso, sin sentido eléctrico. Sirve para
// revisar rápido la miniatura recortada (MiniComponente) de cada tipo del
// catálogo en la tarjeta "Componente(s)" del panel derecho.
export function sesionVitrinaComponentes(): Sesion {
  return {
    instrucciones: EJEMPLO_VITRINA_COMPONENTES,
    netlist: null,
    prompt: '',
    intencion: 'entender',
    // netlist:null → ChatPanel deshabilita el chat, estos campos son inertes
    // (ver nota igual en ejemploSensorLuz.ts).
    proveedor: '',
    proveedorRazon: '',
    nombre: 'Vitrina de componentes (QA)',
    nivel: 'experto',
    mensajes: [
      { de: 'ai', texto: 'Vitrina de QA: un componente distinto por paso, solo para revisar la miniatura de cada tipo en la tarjeta "Componente(s)". No representa un circuito real.' },
    ],
  }
}

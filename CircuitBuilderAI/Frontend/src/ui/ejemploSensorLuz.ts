import { EJEMPLO_SENSOR_LUZ } from '../circuit/layout'
import type { Sesion } from './tipos'

// "Chat de prueba" cargable desde el historial: el sensor de luz nocturna.
// Trae una conversación demo (guion) para ver la experiencia de web chat
// completa mientras el agente real del backend no existe (issue #89).
export function sesionSensorLuz(): Sesion {
  return {
    instrucciones: EJEMPLO_SENSOR_LUZ,
    netlist: null,
    prompt: 'Quiero armar un sensor de luz nocturna que encienda un LED cuando oscurece.',
    intencion: 'armar',
    // Sesión de demo con netlist:null — el chat queda deshabilitado
    // (ChatPanel exige netlist), así que estos campos nunca llegan a una
    // llamada real. '' es el mismo valor de "sin elegir" que usa Bienvenida
    // antes de que el usuario elija en el selector — no un modelo inventado.
    proveedor: '',
    proveedorRazon: '',
    nombre: 'Sensor de luz nocturna',
    nivel: 'intermedio',
    mensajes: [
      { de: 'tu', texto: 'Quiero armar un sensor de luz nocturna que encienda un LED cuando oscurece.' },
      { de: 'ai', texto: '¡Perfecto! Analicé tu esquemático y preparé 14 pasos. La idea: el LDR y R1 forman un divisor de voltaje; cuando oscurece, la resistencia del LDR sube, el nodo del divisor cambia y el transistor Q1 deja pasar corriente para encender el LED. Empieza con el paso 1 →' },
      { de: 'tu', texto: '¿Por qué el LED lleva una resistencia de 220 Ω en serie?' },
      { de: 'ai', texto: 'Buena pregunta — el LED no limita su propia corriente: si lo conectas directo a 9V se quema. R3 (220 Ω) limita la corriente a unos 15–20 mA, el rango seguro. Es la típica «resistencia limitadora» que verás junto a casi cualquier LED.' },
      { de: 'tu', texto: '¿No sería mejor poner el LDR abajo y la resistencia arriba?' },
      { de: 'ai', texto: 'Se puede — e invertiría la lógica: con el LDR abajo, el LED encendería con LUZ en vez de con oscuridad (un «sensor de día»). Para tu objetivo de lámpara nocturna, el LDR va arriba como está en el plan. Si quieres probar la variante, te regenero los pasos desde el checkpoint actual.' },
    ],
  }
}

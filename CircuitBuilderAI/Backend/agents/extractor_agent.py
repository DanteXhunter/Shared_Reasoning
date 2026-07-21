from langgraph.graph import StateGraph, END
from openai import RateLimitError, APIError
from schemas.netlist import Netlist
from pydantic import ValidationError
from typing import TypedDict, Optional
from agents.topologia import construir_nets, avisos_graves
from providers.catalogo import (
    MODELOS_LANGGRAPH,
    crear_modelo_langgraph as crear_modelo,
    crear_provider_chat,
    mensaje_rate_limit,
    es_error_freetier,
    grupo_credencial_de,
)
import base64
import json
import os
import time
from dotenv import load_dotenv

load_dotenv()

MAX_REINTENTOS = 3

PROMPT_EXTRACCION = """
Analiza este esquemático eléctrico y extrae todos los componentes y sus conexiones.
Responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin bloques de código markdown.

Estructura requerida:
{
    "nombre": "Divisor de voltaje con LED",
    "componentes": [
        {
            "id": "R1",
            "tipo": "resistencia",
            "valor": "10k",
            "unidad": "ohm",
            "propiedades": {
                "potencia_nominal": "0.25W",
                "tolerancia": "5%"
            },
            "pines": [
                {"nombre": "pin1", "funcion": "terminal_a"},
                {"nombre": "pin2", "funcion": "terminal_b"}
            ]
        },
        {
            "id": "LED1",
            "tipo": "led",
            "valor": "N/A",
            "unidad": "N/A",
            "pines": [
                {"nombre": "anodo", "funcion": "positivo"},
                {"nombre": "catodo", "funcion": "negativo"}
            ]
        }
    ],
    "conexiones": [
        {
            "de": "R1.pin1",
            "a": "VCC",
            "descripcion": "conexión a alimentación"
        },
        {
            "de": "R1.pin2",
            "a": "LED1.anodo",
            "descripcion": "R1 y LED1 en serie"
        },
        {
            "de": "LED1.catodo",
            "a": "GND",
            "descripcion": "conexión a tierra"
        }
    ]
}

Reglas:
- "nombre": genera un título corto y descriptivo (3 a 6 palabras, en español) de lo que HACE el circuito, no de sus componentes sueltos (ej. "Divisor de voltaje con LED", "Parpadeo de LED con 555", "Sensor de luz con LDR"). Debe servir como título legible del proyecto para una persona. Si no puedes inferir la función, usa el componente principal (ej. "Circuito con transistor NPN"). No uses el nombre del archivo ni comillas dentro del texto.
- Incluye TODOS los componentes visibles en el esquemático
- Antes de listar los componentes, ESCANEA el esquemático completo de forma sistemática (de izquierda a derecha, de arriba a abajo) y CUENTA cuántos símbolos hay de cada tipo (cuántas resistencias, cuántos LEDs, etc.) antes de escribir el JSON. Es común que un esquemático tenga MÁS DE UN componente del mismo tipo (ej. 2 resistencias, R1 y R2) — no asumas que hay solo uno porque el primero que identificaste ya "cumple" la función. Dos símbolos que se ven parecidos o están cerca uno del otro son casi siempre DOS componentes distintos, no uno solo dibujado dos veces.
- SIEMPRE incluye la fuente de alimentación como componente (batería, fuente DC, regulador de voltaje, etc.) aunque esté representada solo como un símbolo. Usa id "BAT1", "V1" o similar según corresponda.
- En "conexiones" SIEMPRE incluye las conexiones al polo positivo (VCC) y al polo negativo/tierra (GND) de cada componente que las tenga. Sin estas conexiones el circuito no funciona.
- En "conexiones" describe también las conexiones DIRECTAS entre dos componentes distintos (ej. "de": "R1.pin2", "a": "LED1.anodo") cuando estén en serie o compartan un nodo que no es VCC ni GND — ver el ejemplo de arriba.
- VCC representa el polo positivo de la fuente. GND representa el polo negativo o tierra.
- En "propiedades" incluye solo las características que puedas identificar: polaridad, voltaje máximo, corriente, potencia, tolerancia, tipo (NPN/PNP), etc.
- Si "propiedades" no es visible en el esquemático, omite ese campo en lugar de poner null
- Los campos "valor" y "unidad" son SIEMPRE obligatorios. Si el valor no es legible en el esquemático (por ejemplo un interruptor, un conector, o una fuente sin etiqueta), usa "valor": "N/A" y "unidad": "N/A".
- Los pines deben tener nombres específicos según el componente: base/colector/emisor para transistores, anodo/catodo para diodos y LEDs, plus/minus para fuentes, etc.
- Los instrumentos de medición (voltímetro, amperímetro, multímetro — círculo con "V" o "A" adentro) SON componentes: inclúyelos con "tipo": "voltimetro" o "amperimetro", con dos pines (plus/minus), igual que cualquier otro componente de 2 patas.
- No inventes componentes, pines o conexiones que no puedas identificar razonablemente en la imagen. Si un símbolo es ambiguo o ilegible, usa tu mejor interpretación de ingeniería (nunca lo omitas si claramente hay un componente ahí), pero no agregues componentes adicionales "por si acaso" ni conexiones que no tengan un trazo o indicio visual que las respalde.
- CATÁLOGO DE REFERENCIA (no es una lista cerrada): estos nombres de "tipo" tienen un dibujo detallado en nuestra biblioteca visual — resistencia, led, diodo, transistor, potenciometro, capacitor, capacitor electrolitico, inductor, fusible, cristal, display 7 segmentos, rele, buzzer, voltimetro, motor, circuito integrado, pulsador, fuente, interruptor, foco, fotorresistor, altavoz, bocina. Si el componente que ves coincide con uno de estos, usa EXACTAMENTE ese nombre para que se dibuje con el mejor detalle posible. Pero si el componente real es otra cosa que no está en esta lista, identifícalo con su nombre técnico correcto de todas formas — NUNCA fuerces ni renombres un componente para que encaje en el catálogo solo porque el catálogo existe. Prioriza siempre representar fielmente lo que ves en el esquemático sobre encajar en la lista; un componente sin dibujo detallado se muestra genérico, pero un componente mal identificado rompe el circuito.

Antes de responder, verifica mentalmente:
[ ] ¿Incluí la fuente de alimentación como componente?
[ ] ¿Volví a contar los símbolos del esquemático y el número de componentes en mi JSON coincide? (revisa especialmente si hay 2+ componentes del mismo tipo)
[ ] ¿Hay al menos una conexión hacia VCC y al menos una hacia GND?
[ ] ¿Cada componente que necesita corriente tiene sus conexiones de alimentación?
[ ] ¿Describí las conexiones DIRECTAS entre componentes distintos, no solo las de VCC/GND?
[ ] ¿Ningún pin visible en el esquemático quedó sin conexión?
"""

class EstadoExtractor(TypedDict):
    imagen_base64: str
    mime_type: str
    proveedor: str
    api_key_override: Optional[str]
    intento: int
    errores: list[str]
    respuesta_raw: Optional[str]
    netlist: Optional[dict]
    exito: bool
    tokens_entrada: int
    tokens_salida: int
    # Por qué el modelo dejó de generar en el último intento: "stop" = terminó
    # solo; "length" = lo cortó un límite de tokens (truncamiento real). Sirve
    # para diagnosticar si un netlist incompleto se debe a truncamiento o a que
    # el modelo no vio las conexiones.
    finish_reason: Optional[str]
    # Tiempo del intento actual (nodo_analizar lo mide, nodo_validar lo cierra
    # en un registro de intentos_detalle) — separado de tiempo_segundos, que en
    # ejecutar_extractor mide el wall-clock de TODA la corrida.
    tiempo_intento: float
    # Desglose por intento (#95): uno por cada llamada al LLM, con su propio
    # costo y si esa respuesta pasó la validación o no.
    intentos_detalle: list[dict]


def nodo_analizar(estado: EstadoExtractor) -> dict:
    inicio_intento = time.time()
    modelo = crear_modelo(estado["proveedor"], estado.get("api_key_override"))
    intento = estado["intento"]
    errores = estado["errores"]

    contenido_usuario = [
        {"type": "text", "text": PROMPT_EXTRACCION},
        {
            "type": "image_url",
            "image_url": {
                "url": f"data:{estado['mime_type']};base64,{estado['imagen_base64']}"
            },
        },
    ]

    if intento > 0 and errores:
        contenido_usuario.append({
            "type": "text",
            "text": f"\nTu respuesta anterior falló la validación con este error:\n{errores[-1]}\nCorrige el JSON y responde de nuevo."
        })

    mensajes = [{"role": "user", "content": contenido_usuario}]
    respuesta = modelo.invoke(mensajes)

    tokens_entrada = respuesta.usage_metadata.get("input_tokens", 0) if respuesta.usage_metadata else 0
    tokens_salida = respuesta.usage_metadata.get("output_tokens", 0) if respuesta.usage_metadata else 0
    finish_reason = (respuesta.response_metadata or {}).get("finish_reason")

    return {
        "respuesta_raw": respuesta.content,
        "intento": intento + 1,
        # Costo de ESTE intento únicamente (no acumulado) — nodo_validar lo
        # cierra con el resultado de la validación en intentos_detalle (#95).
        "tokens_entrada": tokens_entrada,
        "tokens_salida": tokens_salida,
        "tiempo_intento": round(time.time() - inicio_intento, 2),
        "finish_reason": finish_reason,
    }


NODOS_POSITIVOS = {"VCC", "+V", "V+", "ALIMENTACION", "PWR"}
NODOS_NEGATIVOS = {"GND", "GRD", "TIERRA", "0V", "VSS"}

TIPOS_FUENTE = {"fuente", "batería", "bateria", "battery", "voltaje", "voltage",
                "power", "alimentacion", "suministro", "regulador", "supply", "pila"}
PINES_POSITIVOS = {"plus", "positivo", "positive", "anodo", "anode", "vcc", "pos"}
PINES_NEGATIVOS = {"minus", "negativo", "negative", "catodo", "cathode", "gnd",
                   "neg", "tierra", "ground"}
# Unidades que delatan una fuente de SEÑAL (generador de audio/RF), no de
# alimentación DC. Un circuito puede tener ambas (ej. un generador de 1MHz +
# una batería de 9V) — con tipo="fuente" en las dos, no se pueden distinguir
# por nombre de tipo, solo por la unidad de su "valor".
UNIDADES_SEÑAL = {"hz", "khz", "mhz", "ghz"}


def _normalizar_poder(netlist: dict) -> dict:
    """
    Garantiza que el netlist siempre tenga conexiones a VCC y GND.
    Estrategia:
      1. Si ya existen → no hace nada.
      2. Si hay un componente de fuente → conecta sus pines a VCC/GND.
      3. Si no hay fuente → inyecta un BAT1 genérico (9V) y lo conecta.
    """
    conexiones: list = netlist.get("conexiones", [])
    componentes: list = netlist.get("componentes", [])

    nodos = {c["de"].upper() for c in conexiones} | {c["a"].upper() for c in conexiones}
    tiene_vcc = bool(nodos & NODOS_POSITIVOS)
    tiene_gnd = bool(nodos & NODOS_NEGATIVOS)

    if tiene_vcc and tiene_gnd:
        return netlist

    # Intentar conectar la fuente ya existente en el netlist. Si hay varias
    # candidatas (ej. un generador de señal Y una batería, ambos tipo="fuente"),
    # NO tomar la primera a ciegas — preferir la que NO tenga unidad de señal
    # (Hz/kHz/MHz): esa es la alimentación real, no el generador de entrada.
    candidatas = [c for c in componentes if any(k in c.get("tipo", "").lower() for k in TIPOS_FUENTE)]
    fuente = next(
        (c for c in candidatas if c.get("unidad", "").strip().lower() not in UNIDADES_SEÑAL),
        candidatas[0] if candidatas else None,
    )

    if fuente:
        comp_id = fuente["id"]
        for pin in fuente.get("pines", []):
            pin_lower = pin["nombre"].lower()
            if not tiene_vcc and any(k in pin_lower for k in PINES_POSITIVOS):
                conexiones.append({"de": f"{comp_id}.{pin['nombre']}", "a": "VCC", "descripcion": "conexión al polo positivo"})
                tiene_vcc = True
            elif not tiene_gnd and any(k in pin_lower for k in PINES_NEGATIVOS):
                conexiones.append({"de": f"{comp_id}.{pin['nombre']}", "a": "GND", "descripcion": "conexión al polo negativo"})
                tiene_gnd = True

    # Si aún faltan rieles, no inyectamos un componente ficticio.
    # El planner siempre agrega un paso inicial que le indica al usuario
    # conectar su fuente de alimentación a los rieles manualmente.

    netlist["componentes"] = componentes
    netlist["conexiones"] = conexiones
    return netlist


def nodo_validar(estado: EstadoExtractor) -> dict:
    texto_raw = estado["respuesta_raw"] or ""
    texto = texto_raw.strip().replace("```json", "").replace("```", "").strip()

    # Costo de ESTE intento (ver nodo_analizar) — se cierra acá con el
    # resultado de la validación y se agrega al desglose por intento (#95).
    registro_base = {
        "numero": estado["intento"],
        "tokens_entrada": estado["tokens_entrada"],
        "tokens_salida": estado["tokens_salida"],
        "tokens_total": estado["tokens_entrada"] + estado["tokens_salida"],
        "tiempo_segundos": estado.get("tiempo_intento", 0.0),
    }

    def _fallo(error: str) -> dict:
        return {
            "errores": estado["errores"] + [error],
            "exito": False,
            "intentos_detalle": estado["intentos_detalle"] + [{**registro_base, "exito": False, "error": error}],
        }

    try:
        datos = json.loads(texto)
    except json.JSONDecodeError as e:
        return _fallo(f"JSON inválido: {str(e)}")

    try:
        netlist = Netlist(**datos)
    except ValidationError as e:
        errores_legibles = "; ".join(
            f"{err['loc']}: {err['msg']}" for err in e.errors()
        )
        return _fallo(f"Estructura inválida: {errores_legibles}")

    netlist_dict = netlist.model_dump()

    if not netlist_dict.get("componentes"):
        return _fallo("El netlist no contiene ningún componente. Extrae todos los componentes visibles en el esquemático.")

    if not netlist_dict.get("conexiones"):
        return _fallo("El netlist no contiene ninguna conexión. Describe todas las conexiones entre componentes.")

    # Integridad referencial ANTES que cualquier análisis topológico: si una
    # conexión apunta a un componente o pin que no existe, los nets que salgan
    # de ahí no significan nada (ese endpoint se degrada a "nodo suelto" y el
    # resto de las comprobaciones lo ignoran en silencio). Fue exactamente lo
    # que dejó pasar un netlist con conexiones hacia un "R8" inexistente, que
    # el planner luego materializó como una resistencia de más.
    errores_referencias = avisos_graves(construir_nets(netlist_dict)[1])
    if errores_referencias:
        return _fallo("\n".join(errores_referencias))

    errores_topologia = _detectar_pines_propios_en_mismo_nodo(netlist_dict)
    if errores_topologia:
        return _fallo("\n".join(errores_topologia))

    netlist_dict = _normalizar_poder(netlist_dict)

    return {
        "netlist": netlist_dict,
        "exito": True,
        "intentos_detalle": estado["intentos_detalle"] + [{**registro_base, "exito": True, "error": None}],
    }


def _detectar_pines_propios_en_mismo_nodo(netlist: dict) -> list[str]:
    """
    Si se fusionan por error dos nodos distintos del esquemático, es frecuente
    que un mismo componente termine con 2 de sus propios pines en el mismo
    nodo eléctrico — eso lo cortocircuita a sí mismo (ej. una resistencia con
    sus 2 patas al mismo punto no hace nada en el circuito). Casi siempre es
    síntoma de una topología mal leída, no un circuito real, así que se
    rebota como error para que la IA vuelva a mirar la imagen.
    """
    nets, _ = construir_nets(netlist)
    errores: list[str] = []
    for net in nets:
        por_componente: dict[str, list[str]] = {}
        for comp_id, pin in net["pines"]:
            por_componente.setdefault(comp_id, []).append(pin)
        for comp_id, pines in por_componente.items():
            if len(pines) > 1:
                errores.append(
                    f"El componente {comp_id} tiene sus pines {', '.join(pines)} unidos al mismo "
                    f"nodo eléctrico — eso lo cortocircuita a sí mismo (no hace nada en el circuito). "
                    f"Vuelve a revisar la imagen: probablemente confundiste dos nodos distintos del "
                    f"esquemático y los uniste por error en las conexiones."
                )
    return errores


def decidir_siguiente(estado: EstadoExtractor) -> str:
    if estado["exito"]:
        return END
    if estado["intento"] >= MAX_REINTENTOS:
        return END
    return "analizar"


def crear_grafo_extractor():
    grafo = StateGraph(EstadoExtractor)

    grafo.add_node("analizar", nodo_analizar)
    grafo.add_node("validar", nodo_validar)

    grafo.set_entry_point("analizar")
    grafo.add_edge("analizar", "validar")
    grafo.add_conditional_edges("validar", decidir_siguiente, {END: END, "analizar": "analizar"})

    return grafo.compile()


async def ejecutar_extractor(
    imagen_bytes: bytes,
    mime_type: str,
    proveedor: str,
    api_key_override: str | None = None,
) -> dict:
    inicio = time.time()

    imagen_base64 = base64.b64encode(imagen_bytes).decode("utf-8")

    config = MODELOS_LANGGRAPH.get(proveedor)
    if not config:
        return {
            "error": True,
            "mensaje": f"Proveedor '{proveedor}' no soportado por el agente extractor.",
            "errores": [f"Proveedores disponibles: {list(MODELOS_LANGGRAPH.keys())}"],
            "uso": {
                "tokens_entrada": 0,
                "tokens_salida": 0,
                "tokens_total": 0,
                "intentos": 0,
                "modelo_activo": "ninguno",
                "tiempo_segundos": 0,
            },
        }

    estado_inicial = {
        "imagen_base64": imagen_base64,
        "mime_type": mime_type,
        "proveedor": proveedor,
        "api_key_override": api_key_override,
        "intento": 0,
        "errores": [],
        "respuesta_raw": None,
        "netlist": None,
        "exito": False,
        "tokens_entrada": 0,
        "tokens_salida": 0,
        "finish_reason": None,
        "tiempo_intento": 0.0,
        "intentos_detalle": [],
    }

    grafo = crear_grafo_extractor()
    modelo_activo = config["model"]

    try:
        estado_final = await grafo.ainvoke(estado_inicial)
    except RateLimitError as e:
        # 429 del proveedor. Sin este try/except la excepción escapaba sin
        # manejar y FastAPI la convertía en un 500 sin headers de CORS — el
        # navegador lo reportaba como un bloqueo de CORS, ocultando la causa.
        # El motivo real lo determina el cuerpo del error, no el proveedor.
        tiempo_total = round(time.time() - inicio, 2)
        mensaje, detalle = mensaje_rate_limit(proveedor, modelo_activo, e)
        return {
            "error": True,
            "mensaje": mensaje,
            "errores": [detalle],
            # Confirmación real (no una prueba sintética) de que la key PROPIA
            # del usuario no tiene facturación — ver disponibilidad_usuario.py
            # y Usuario.sin_facturacion_confirmada. None si se usó la key del
            # servidor (api_key_override vacío) o si no fue este motivo.
            "sin_facturacion_grupo": (
                grupo_credencial_de(proveedor)["id"]
                if api_key_override and es_error_freetier(e) and grupo_credencial_de(proveedor)
                else None
            ),
            "uso": {
                "tokens_entrada": 0,
                "tokens_salida": 0,
                "tokens_total": 0,
                "intentos": 0,
                "modelo_activo": modelo_activo,
                "tiempo_segundos": tiempo_total,
            },
        }
    except APIError as e:
        tiempo_total = round(time.time() - inicio, 2)
        return {
            "error": True,
            "mensaje": f"El proveedor '{proveedor}' no respondió correctamente. Intenta de nuevo o cambia de modelo.",
            "errores": [str(e)],
            "uso": {
                "tokens_entrada": 0,
                "tokens_salida": 0,
                "tokens_total": 0,
                "intentos": 0,
                "modelo_activo": modelo_activo,
                "tiempo_segundos": tiempo_total,
            },
        }

    tiempo_total = round(time.time() - inicio, 2)
    intentos_detalle = estado_final["intentos_detalle"]
    # Derivados del desglose por intento (#95) — misma fuente de verdad que
    # usa planner_agent.py, en vez de un acumulado aparte que se desincroniza.
    tokens_entrada_total = sum(d["tokens_entrada"] for d in intentos_detalle)
    tokens_salida_total = sum(d["tokens_salida"] for d in intentos_detalle)

    if estado_final["exito"]:
        return {
            "resultado": estado_final["netlist"],
            "uso": {
                "tokens_entrada": tokens_entrada_total,
                "tokens_salida": tokens_salida_total,
                "tokens_total": tokens_entrada_total + tokens_salida_total,
                "intentos": estado_final["intento"],
                "modelo_activo": modelo_activo,
                "tiempo_segundos": tiempo_total,
                "finish_reason": estado_final.get("finish_reason"),
                "intentos_detalle": intentos_detalle,
            },
        }
    else:
        return {
            "error": True,
            "mensaje": f"No se pudo extraer un netlist válido después de {estado_final['intento']} intentos.",
            "errores": estado_final["errores"],
            "uso": {
                "tokens_entrada": tokens_entrada_total,
                "tokens_salida": tokens_salida_total,
                "tokens_total": tokens_entrada_total + tokens_salida_total,
                "intentos": estado_final["intento"],
                "modelo_activo": modelo_activo,
                "tiempo_segundos": tiempo_total,
                "finish_reason": estado_final.get("finish_reason"),
                "intentos_detalle": intentos_detalle,
            },
        }
from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from agents.estado import EstadoGlobal, ModoInteraccion
from pydantic import ValidationError
from typing import Optional
import json
import os
import time
from dotenv import load_dotenv

load_dotenv()

MAX_REINTENTOS = 3

MODELOS_LANGGRAPH = {
    "openai": {
        "model": "gpt-4o-mini",
        "api_key_env": "OPENAI_API_KEY",
        "base_url": None,
    },
    "nemotron": {
        "model": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
        "api_key_env": "NVIDIA_API_KEY",
        "base_url": "https://integrate.api.nvidia.com/v1",
    },
    "llama-vision": {
        "model": "meta/llama-3.2-11b-vision-instruct",
        "api_key_env": "NVIDIA_API_KEY",
        "base_url": "https://integrate.api.nvidia.com/v1",
    },
}

COLUMNAS_IZQUIERDA = ["a", "b", "c", "d", "e"]
COLUMNAS_DERECHA = ["f", "g", "h", "i", "j"]
TOTAL_FILAS = 30

# Tipos de componente que representan una fuente de alimentación externa.
# Estos no se posicionan en filas del protoboard — el usuario los conecta manualmente a los rieles.
TIPOS_FUENTE = {"fuente", "batería", "bateria", "battery", "voltaje", "voltage",
                "power", "alimentacion", "suministro", "regulador", "supply", "pila"}


def crear_modelo(proveedor: str) -> ChatOpenAI:
    config = MODELOS_LANGGRAPH.get(proveedor)
    if not config:
        raise ValueError(f"Proveedor '{proveedor}' no tiene configuración para LangGraph.")

    params = {
        "model": config["model"],
        "api_key": os.getenv(config["api_key_env"]),
        "temperature": 0,
        "max_retries": 0,
    }

    if config["base_url"]:
        params["base_url"] = config["base_url"]

    return ChatOpenAI(**params)


# ─────────────────────────────────────────────
# ALGORITMO DE POSICIONAMIENTO (sin LLM)
# ─────────────────────────────────────────────

def calcular_posiciones(netlist: dict, overrides: Optional[dict] = None) -> dict:
    """
    Asigna coordenadas físicas a cada componente del netlist.
    Cada componente ocupa una fila. Sus pines van en columnas b y g,
    cruzando el gap central del protoboard.

    overrides: {comp_id: fila} — fuerza esa fila para el componente indicado.
    Los demás componentes se asignan secuencialmente evitando las filas reservadas.

    Retorna un diccionario: componente_id -> {pin -> {fila, columna}}
    """
    posiciones = {}
    filas_reservadas = set(overrides.values()) if overrides else set()
    fila_actual = 1

    for componente in netlist.get("componentes", []):
        comp_id = componente["id"]
        tipo = componente.get("tipo", "").lower()

        # Las fuentes de alimentación no ocupan filas — el usuario las conecta a los rieles externamente.
        if any(k in tipo for k in TIPOS_FUENTE):
            continue

        pines = componente.get("pines", [])
        posiciones[comp_id] = {}

        if overrides and comp_id in overrides:
            fila = overrides[comp_id]
        else:
            while fila_actual in filas_reservadas:
                fila_actual += 1
            fila = fila_actual
            fila_actual += 2

        for i, pin in enumerate(pines):
            columna = "b" if i % 2 == 0 else "g"
            posiciones[comp_id][pin["nombre"]] = {
                "fila": fila,
                "columna": columna,
            }

    return posiciones


def calcular_cables(netlist: dict, posiciones: dict) -> list:
    """
    Determina los cables necesarios para cada conexión del netlist.
    Si la conexión es a VCC o GND, el cable va al rail correspondiente.
    Si es entre dos pines de componentes, conecta sus coordenadas.
    """
    cables = []

    for conexion in netlist.get("conexiones", []):
        origen_str = conexion["de"]
        destino_str = conexion["a"]

        origen_coord = _resolver_coordenada(origen_str, posiciones)
        destino_coord = _resolver_coordenada(destino_str, posiciones)

        if origen_coord and destino_coord:
            color = _elegir_color_cable(origen_str, destino_str)
            cables.append({
                "de": origen_str,
                "a": destino_str,
                "color": color,
                "desde": origen_coord,
                "hasta": destino_coord,
            })

    return cables


def _resolver_coordenada(referencia: str, posiciones: dict) -> Optional[dict]:
    """
    Convierte una referencia como 'R1.pin1' o 'VCC' en coordenadas físicas.
    """
    referencia_upper = referencia.upper()

    if referencia_upper in ["VCC", "+V", "V+", "ALIMENTACION", "PWR"]:
        return {"fila": 0, "columna": "+"}

    if referencia_upper in ["GND", "GRD", "TIERRA", "0V", "VSS"]:
        return {"fila": 0, "columna": "-"}

    if "." in referencia:
        partes = referencia.split(".")
        comp_id = partes[0]
        pin_nombre = partes[1]

        if comp_id in posiciones and pin_nombre in posiciones[comp_id]:
            return posiciones[comp_id][pin_nombre]

    return None


def _elegir_color_cable(origen: str, destino: str) -> str:
    NODOS_POSITIVOS = {"VCC", "+V", "V+", "ALIMENTACION", "PWR"}
    NODOS_NEGATIVOS = {"GND", "GRD", "TIERRA", "0V", "VSS"}
    if origen.upper() in NODOS_POSITIVOS or destino.upper() in NODOS_POSITIVOS:
        return "rojo"
    if origen.upper() in NODOS_NEGATIVOS or destino.upper() in NODOS_NEGATIVOS:
        return "negro"
    return "amarillo"


# ─────────────────────────────────────────────
# NODOS DEL GRAFO
# ─────────────────────────────────────────────

def nodo_planificar(estado: EstadoGlobal) -> dict:
    inicio = time.time()
    modelo = crear_modelo(estado["proveedor"])
    netlist = estado["extractor_netlist"]
    modo = estado.get("modo_interaccion", ModoInteraccion.UNDER)
    intento = estado["planner_intento"]
    errores = estado["planner_errores"]

    overrides = estado.get("planner_posiciones_override")
    posiciones = calcular_posiciones(netlist, overrides)
    cables = calcular_cables(netlist, posiciones)

    prompt_modo = {
        ModoInteraccion.UNDER: """Redacta cada instrucción como si le hablaras a alguien que nunca ha tocado un protoboard en su vida.
        Usa lenguaje cotidiano, no técnico. Menciona características físicas del componente (color de bandas, tamaño, forma) para que el usuario lo identifique fácilmente.
        Explica el POR QUÉ de cada paso, no solo el qué. Por ejemplo: 'Conecta este cable rojo al rail positivo porque es por donde entrará la energía al circuito.'
Las coordenadas técnicas (fila, columna) deben mencionarse de forma natural dentro de la explicación, no como especificación fría.""",

        ModoInteraccion.OVER: """El usuario es experto. Sé conciso y directo.
Menciona solo lo esencial: qué componente, dónde va, qué conecta con qué.
No expliques el porqué ni des contexto adicional.""",

        ModoInteraccion.ALONG: """Redacta cada instrucción como una propuesta colaborativa, no una orden.
Usa frases como 'podrías', 'una opción sería', 'qué tal si'.
Deja espacio para que el usuario tome decisiones propias.""",

        ModoInteraccion.IN: """Redacta cada instrucción de forma clara y espera que el usuario confirme antes de continuar.
Al final de cada descripción agrega: '¿Listo para continuar?'""",

        ModoInteraccion.ON: """Redacta el plan completo de forma clara y estructurada.
El usuario lo leerá todo primero y luego ejecutará. Asegúrate de que cada paso sea autocontenido y no dependa de contexto anterior.""",
    }

    instrucciones_modo = prompt_modo.get(modo, prompt_modo[ModoInteraccion.UNDER])

    prompt = f"""
Eres un asistente experto en electrónica. Tienes el netlist de un circuito y las posiciones físicas calculadas para un protoboard estándar de 830 puntos (30 filas, columnas a-j, rails + y -).

NETLIST:
{json.dumps(netlist, ensure_ascii=False, indent=2)}

POSICIONES CALCULADAS:
{json.dumps(posiciones, ensure_ascii=False, indent=2)}

CABLES NECESARIOS:
{json.dumps(cables, ensure_ascii=False, indent=2)}

MODO DE INTERACCIÓN: {modo}
INSTRUCCIONES DEL MODO: {instrucciones_modo}

{"ERRORES DEL INTENTO ANTERIOR QUE DEBES CORREGIR: " + errores[-1] if intento > 0 and errores else ""}

Genera las instrucciones de armado del circuito. Responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin bloques de código markdown.

Estructura requerida:
{{
    "pasos": [
        {{
            "numero": 1,
            "tipo": "colocar_componente",
            "componente_id": "R1",
            "componente_tipo": "resistencia",
            "componente_valor": "10k",
            "descripcion": "Instrucción en lenguaje natural clara para el usuario",
            "pines": [
                {{"nombre": "pin1", "fila": 1, "columna": "b"}},
                {{"nombre": "pin2", "fila": 1, "columna": "g"}}
            ],
            "cable": null
        }},
        {{
            "numero": 2,
            "tipo": "conectar_cable",
            "componente_id": null,
            "componente_tipo": null,
            "componente_valor": null,
            "descripcion": "Instrucción en lenguaje natural clara para el usuario",
            "pines": null,
            "cable": {{
                "color": "rojo",
                "desde": {{"fila": 0, "columna": "+"}},
                "hasta": {{"fila": 1, "columna": "b"}}
            }}
        }}
    ]
}}

Reglas:
- Primero coloca todos los componentes, luego conecta los cables
- fila: 0 con columna: "+" representa el rail positivo, columna: "-" el rail negativo
- Usa las posiciones exactas del JSON de posiciones calculadas — no las inventes
- La descripcion debe adaptarse al modo de interacción indicado
- Incluye un paso por cada componente y un paso por cada cable
"""

    mensajes = [{"role": "user", "content": prompt}]
    respuesta = modelo.invoke(mensajes)

    tokens_entrada = respuesta.usage_metadata.get("input_tokens", 0) if respuesta.usage_metadata else 0
    tokens_salida = respuesta.usage_metadata.get("output_tokens", 0) if respuesta.usage_metadata else 0

    return {
        "planner_respuesta_raw": respuesta.content,
        "planner_intento": intento + 1,
        "planner_tokens_entrada": estado["planner_tokens_entrada"] + tokens_entrada,
        "planner_tokens_salida": estado["planner_tokens_salida"] + tokens_salida,
        "planner_tiempo": round(time.time() - inicio, 2),
    }


DESCRIPCION_FUENTE = {
    ModoInteraccion.UNDER: (
        "Antes de colocar cualquier componente, conecta tu fuente de alimentación a la protoboard: "
        "el cable ROJO va al riel marcado con '+' (riel positivo, la tira roja) y el cable NEGRO "
        "va al riel marcado con '-' (riel negativo, la tira azul). "
        "Piénsalo como enchufar la energía antes de armar el circuito — sin esto, nada funcionará."
    ),
    ModoInteraccion.ALONG: (
        "Podrías empezar conectando tu fuente de alimentación a los rieles de la protoboard: "
        "positivo al riel '+' y negativo al riel '-'. ¿Tienes lista tu batería o módulo de alimentación?"
    ),
    ModoInteraccion.OVER: "Conecta la fuente: positivo → riel +, negativo → riel -.",
    ModoInteraccion.IN: (
        "Conecta tu fuente de alimentación: cable rojo al riel '+' y cable negro al riel '-'. "
        "¿Listo para continuar?"
    ),
    ModoInteraccion.ON: (
        "Paso previo obligatorio: conecta tu fuente de alimentación a los rieles de la protoboard "
        "(positivo al '+', negativo al '-') antes de proceder con el armado."
    ),
}


def _asegurar_paso_fuente(pasos: list, modo: ModoInteraccion) -> list:
    """Garantiza que el primer paso siempre sea conectar la fuente de alimentación a los rieles."""
    tiene_fuente = any(p.get("tipo") == "conectar_fuente" for p in pasos)
    if tiene_fuente:
        return pasos

    descripcion = DESCRIPCION_FUENTE.get(modo, DESCRIPCION_FUENTE[ModoInteraccion.UNDER])
    paso_fuente = {
        "numero": 1,
        "tipo": "conectar_fuente",
        "componente_id": None,
        "componente_tipo": "fuente",
        "componente_valor": None,
        "descripcion": descripcion,
        "pines": None,
        "cable": None,
    }
    pasos_renumerados = [{**p, "numero": p["numero"] + 1} for p in pasos]
    return [paso_fuente] + pasos_renumerados


def nodo_validar_plan(estado: EstadoGlobal) -> dict:
    texto_raw = estado["planner_respuesta_raw"] or ""
    texto = texto_raw.strip().replace("```json", "").replace("```", "").strip()

    try:
        datos = json.loads(texto)
    except json.JSONDecodeError as e:
        return {
            "planner_errores": estado["planner_errores"] + [f"JSON inválido: {str(e)}"],
            "planner_exito": False,
        }

    if "pasos" not in datos or len(datos["pasos"]) == 0:
        return {
            "planner_errores": estado["planner_errores"] + ["El JSON no contiene pasos o la lista está vacía"],
            "planner_exito": False,
        }

    for paso in datos["pasos"]:
        if "numero" not in paso or "tipo" not in paso or "descripcion" not in paso:
            return {
                "planner_errores": estado["planner_errores"] + [f"Paso incompleto: falta numero, tipo o descripcion en {paso}"],
                "planner_exito": False,
            }

    modo = estado.get("modo_interaccion", ModoInteraccion.UNDER)
    pasos = _asegurar_paso_fuente(datos["pasos"], modo)

    return {
        "planner_instrucciones": pasos,
        "planner_exito": True,
    }


def decidir_siguiente_plan(estado: EstadoGlobal) -> str:
    if estado["planner_exito"]:
        return END
    if estado["planner_intento"] >= MAX_REINTENTOS:
        return END
    return "planificar"


# ─────────────────────────────────────────────
# GRAFO
# ─────────────────────────────────────────────

def crear_grafo_planner():
    grafo = StateGraph(EstadoGlobal)

    grafo.add_node("planificar", nodo_planificar)
    grafo.add_node("validar_plan", nodo_validar_plan)

    grafo.set_entry_point("planificar")
    grafo.add_edge("planificar", "validar_plan")
    grafo.add_conditional_edges("validar_plan", decidir_siguiente_plan, {END: END, "planificar": "planificar"})

    return grafo.compile()


async def ejecutar_planner(estado_extractor: dict) -> dict:
    estado_inicial = {
        **estado_extractor,
        "planner_intento": 0,
        "planner_errores": [],
        "planner_respuesta_raw": None,
        "planner_instrucciones": None,
        "planner_exito": False,
        "planner_tokens_entrada": 0,
        "planner_tokens_salida": 0,
        "planner_tiempo": 0.0,
    }

    grafo = crear_grafo_planner()
    estado_final = await grafo.ainvoke(estado_inicial)

    config = MODELOS_LANGGRAPH.get(estado_extractor["proveedor"], {})
    modelo_activo = config.get("model", "desconocido")

    if estado_final["planner_exito"]:
        return {
            "instrucciones": estado_final["planner_instrucciones"],
            "uso": {
                "tokens_entrada": estado_final["planner_tokens_entrada"],
                "tokens_salida": estado_final["planner_tokens_salida"],
                "tokens_total": estado_final["planner_tokens_entrada"] + estado_final["planner_tokens_salida"],
                "intentos": estado_final["planner_intento"],
                "modelo_activo": modelo_activo,
                "tiempo_segundos": estado_final["planner_tiempo"],
            },
        }
    else:
        return {
            "error": True,
            "mensaje": f"No se pudo generar un plan válido después de {estado_final['planner_intento']} intentos.",
            "errores": estado_final["planner_errores"],
            "uso": {
                "tokens_entrada": estado_final["planner_tokens_entrada"],
                "tokens_salida": estado_final["planner_tokens_salida"],
                "tokens_total": estado_final["planner_tokens_entrada"] + estado_final["planner_tokens_salida"],
                "intentos": estado_final["planner_intento"],
                "modelo_activo": modelo_activo,
                "tiempo_segundos": estado_final["planner_tiempo"],
            },
        }
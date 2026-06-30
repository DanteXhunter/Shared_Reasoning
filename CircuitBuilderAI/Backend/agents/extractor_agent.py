from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from schemas.netlist import Netlist
from pydantic import ValidationError
from typing import TypedDict, Optional
import base64
import json
import os
from dotenv import load_dotenv

load_dotenv()

MAX_REINTENTOS = 3

PROMPT_EXTRACCION = """
Analiza este esquemático eléctrico y extrae todos los componentes y sus conexiones.
Responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin bloques de código markdown.

Estructura requerida:
{
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
        }
    ],
    "conexiones": [
        {
            "de": "R1.pin1",
            "a": "VCC",
            "descripcion": "conexión a alimentación"
        }
    ]
}

Reglas:
- Incluye TODOS los componentes visibles en el esquemático
- En "propiedades" incluye solo las características que puedas identificar: polaridad, voltaje máximo, corriente, potencia, tolerancia, tipo (NPN/PNP), etc.
- Si un valor no es visible en el esquemático, omite esa propiedad en lugar de poner null
- Los pines deben tener nombres específicos según el componente: base/colector/emisor para transistores, anodo/catodo para diodos y LEDs, etc.
- En "conexiones" describe cada conexión entre pines o hacia nodos como VCC, GND, etc.
"""

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


class EstadoExtractor(TypedDict):
    imagen_base64: str
    mime_type: str
    proveedor: str
    intento: int
    errores: list[str]
    respuesta_raw: Optional[str]
    netlist: Optional[dict]
    exito: bool
    tokens_entrada: int
    tokens_salida: int


def crear_modelo(proveedor: str):
    config = MODELOS_LANGGRAPH.get(proveedor)
    if not config:
        raise ValueError(
            f"Proveedor '{proveedor}' no tiene configuración para LangGraph. "
            f"Disponibles: {list(MODELOS_LANGGRAPH.keys())}"
        )

    params = {
        "model": config["model"],
        "api_key": os.getenv(config["api_key_env"]),
        "temperature": 0,
        "max_retries": 0,
    }

    if config["base_url"]:
        params["base_url"] = config["base_url"]

    return ChatOpenAI(**params)


def nodo_analizar(estado: EstadoExtractor) -> dict:
    modelo = crear_modelo(estado["proveedor"])
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

    return {
        "respuesta_raw": respuesta.content,
        "intento": intento + 1,
        "tokens_entrada": estado["tokens_entrada"] + tokens_entrada,
        "tokens_salida": estado["tokens_salida"] + tokens_salida,
    }


def nodo_validar(estado: EstadoExtractor) -> dict:
    texto_raw = estado["respuesta_raw"] or ""
    texto = texto_raw.strip().replace("```json", "").replace("```", "").strip()

    try:
        datos = json.loads(texto)
    except json.JSONDecodeError as e:
        return {
            "errores": estado["errores"] + [f"JSON inválido: {str(e)}"],
            "exito": False,
        }

    try:
        netlist = Netlist(**datos)
        return {
            "netlist": netlist.model_dump(),
            "exito": True,
        }
    except ValidationError as e:
        errores_legibles = "; ".join(
            f"{err['loc']}: {err['msg']}" for err in e.errors()
        )
        return {
            "errores": estado["errores"] + [f"Estructura inválida: {errores_legibles}"],
            "exito": False,
        }


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


async def ejecutar_extractor(imagen_bytes: bytes, mime_type: str, proveedor: str) -> dict:
    import time
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
        "intento": 0,
        "errores": [],
        "respuesta_raw": None,
        "netlist": None,
        "exito": False,
        "tokens_entrada": 0,
        "tokens_salida": 0,
    }

    grafo = crear_grafo_extractor()
    estado_final = await grafo.ainvoke(estado_inicial)

    modelo_activo = config["model"]
    tiempo_total = round(time.time() - inicio, 2)

    if estado_final["exito"]:
        return {
            "resultado": estado_final["netlist"],
            "uso": {
                "tokens_entrada": estado_final["tokens_entrada"],
                "tokens_salida": estado_final["tokens_salida"],
                "tokens_total": estado_final["tokens_entrada"] + estado_final["tokens_salida"],
                "intentos": estado_final["intento"],
                "modelo_activo": modelo_activo,
                "tiempo_segundos": tiempo_total,
            },
        }
    else:
        return {
            "error": True,
            "mensaje": f"No se pudo extraer un netlist válido después de {estado_final['intento']} intentos.",
            "errores": estado_final["errores"],
            "uso": {
                "tokens_entrada": estado_final["tokens_entrada"],
                "tokens_salida": estado_final["tokens_salida"],
                "tokens_total": estado_final["tokens_entrada"] + estado_final["tokens_salida"],
                "intentos": estado_final["intento"],
                "modelo_activo": modelo_activo,
                "tiempo_segundos": tiempo_total,
            },
        }
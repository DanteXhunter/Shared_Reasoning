"""Diagnóstico del tipo de interacción humano-IA (taxonomía IN/ON/OVER/UNDER/
ALONG — ver CLAUDE.md §2/§4). Siempre vía LLM con system prompt, nunca un
valor fijo ni derivado del nivel: nivel (básico/intermedio/experto) solo
controla verbosidad (agents/verbosidad.py) — son ejes independientes (#82).
"""

import json
from agents.estado import ModoInteraccion
from providers.mllm_provider import MLLMProvider
from providers.catalogo import acepta_temperature

TIPOS_VALIDOS = [m.value for m in ModoInteraccion]

# Misma tabla de señales que usa el clasificador del chat (chat_agent_v2.py) —
# una sola fuente para no describir la taxonomía dos veces con textos que
# puedan divergir.
TABLA_TIPOS_INTERACCION = """- IN: el usuario pide aprobar cada micro-acción antes de que ocurra (ej. "espera, confírmame antes de cada cable") → máxima supervisión.
- ON: deja avanzar a la IA sola y solo interviene si algo se ve mal (ej. "sigue, avísame si hay un problema").
- OVER: define un objetivo o restricción de alto nivel, no el cómo (ej. "hazlo con menos cables", "¿no sería mejor poner la resistencia en C5?").
- UNDER: acepta la propuesta y ejecuta lo que se le indica paso a paso (ej. "listo, coloqué la resistencia en A5").
- ALONG: co-razona sobre alternativas sin ceder el control ni imponerlo (ej. "si movemos esto aquí, ¿cambiaría la secuencia?")."""

PROMPT_DIAGNOSTICO_INICIAL = """Vas a diagnosticar el tipo de interacción humano-IA de un momento específico dentro de una tarea de armado de circuitos, según esta taxonomía:

{tabla_tipos}

CONTEXTO DE ESTE MOMENTO: es la PRIMERA interacción de la sesión. El usuario subió un esquemático eléctrico y declaró su nivel ({nivel}); el sistema generó automáticamente el plan de armado completo (todos los pasos) sin que el usuario diera todavía ninguna instrucción, restricción o mensaje propio.

Diagnostica cuál de los 5 tipos describe mejor este momento — no asumas uno por default, razónalo a partir de la taxonomía de arriba.

Responde ÚNICAMENTE con el JSON:
{{"tipo_interaccion": "<IN|ON|OVER|UNDER|ALONG>"}}
"""


def validar_tipo_interaccion(valor: str | None) -> str:
    """Normaliza la salida del LLM contra los 5 valores válidos. UNDER es el
    fallback solo ante una respuesta no parseable/no reconocida — nunca es un
    valor que se asuma de entrada."""
    return valor if valor in TIPOS_VALIDOS else ModoInteraccion.UNDER.value


async def diagnosticar_interaccion_inicial(nivel: str, proveedor: MLLMProvider, proveedor_id: str) -> str:
    """Diagnóstico de la primera interacción de la sesión (sin texto libre del
    usuario todavía) — se llama una vez desde /planificar. Devuelve el valor
    de ModoInteraccion (string)."""
    prompt = PROMPT_DIAGNOSTICO_INICIAL.format(tabla_tipos=TABLA_TIPOS_INTERACCION, nivel=nivel)
    kwargs = {"temperature": 0} if acepta_temperature(proveedor_id) else {}

    respuesta = await proveedor.client.chat.completions.create(
        model=proveedor.model,
        messages=[{"role": "user", "content": prompt}],
        **kwargs,
    )

    contenido = respuesta.choices[0].message.content or ""
    contenido = contenido.strip().replace("```json", "").replace("```", "").strip()

    try:
        datos = json.loads(contenido)
        return validar_tipo_interaccion(datos.get("tipo_interaccion"))
    except json.JSONDecodeError:
        return ModoInteraccion.UNDER.value

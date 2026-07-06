import time
import json
from agents.estado import EstadoGlobal, MensajeChat
from agents.chat_agent import ejecutar_chat_agent, SYSTEM_PROMPT, _construir_contexto_circuito
from agents.planner_agent import ejecutar_planner
from providers.openai_provider import OpenAIProvider


PROMPT_CLASIFICADOR = """Analiza el siguiente mensaje del usuario en el contexto de un asistente de armado de circuitos eléctricos.

Clasifica la intención del mensaje en UNA de estas tres categorías:
- "responder": el usuario hace una pregunta o comentario que no requiere cambiar el circuito
- "modificar_netlist": el usuario propone cambiar una conexión eléctrica (cambiar a qué nodo se conecta un pin)
- "modificar_posiciones": el usuario propone mover un componente físicamente en el protoboard sin cambiar su conexión eléctrica

Responde ÚNICAMENTE con el JSON:
{"intencion": "<categoria>"}

Mensaje del usuario: {mensaje}
"""


PROMPT_MODIFICAR_NETLIST = """Eres un asistente experto en electrónica. El usuario quiere modificar una conexión del circuito.

NETLIST ACTUAL:
{netlist}

MENSAJE DEL USUARIO:
{mensaje}

Tu tarea: aplicar el cambio solicitado al netlist y devolver el netlist completo actualizado.
Responde ÚNICAMENTE con el JSON del netlist actualizado, con la misma estructura que el netlist original.
No agregues texto adicional ni bloques de código markdown.
"""


async def _clasificar_intencion(mensaje: str, proveedor: OpenAIProvider) -> str:
    """Llama al LLM para clasificar la intención del mensaje."""
    prompt = PROMPT_CLASIFICADOR.format(mensaje=mensaje)

    respuesta = await proveedor.client.chat.completions.create(
        model=proveedor.model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
    )

    contenido = respuesta.choices[0].message.content or ""
    contenido = contenido.strip().replace("```json", "").replace("```", "").strip()

    try:
        datos = json.loads(contenido)
        intencion = datos.get("intencion", "responder")
        if intencion not in ["responder", "modificar_netlist", "modificar_posiciones"]:
            return "responder"
        return intencion
    except json.JSONDecodeError:
        return "responder"


async def _aplicar_modificacion_netlist(
    mensaje: str,
    netlist_actual: dict,
    proveedor: OpenAIProvider,
) -> dict:
    """Pide al LLM que aplique el cambio al netlist y devuelve el netlist modificado."""
    prompt = PROMPT_MODIFICAR_NETLIST.format(
        netlist=json.dumps(netlist_actual, ensure_ascii=False, indent=2),
        mensaje=mensaje,
    )

    respuesta = await proveedor.client.chat.completions.create(
        model=proveedor.model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
    )

    contenido = respuesta.choices[0].message.content or ""
    contenido = contenido.strip().replace("```json", "").replace("```", "").strip()

    return json.loads(contenido)


async def ejecutar_chat_agent_v2(estado: EstadoGlobal) -> dict:
    """
    Chat Agent extendido: clasifica la intención del usuario y actúa en consecuencia.
    - Si es una pregunta: responde usando el Chat Agent base.
    - Si es modificación de netlist: aplica el cambio, redispara el Planner y devuelve el estado actualizado.
    - Si es modificación de posiciones: delega al #68 (por ahora responde como el base).
    """
    inicio = time.time()

    historial: list[MensajeChat] = estado.get("historial_chat", [])
    if not historial:
        return {
            "error": True,
            "mensaje": "No hay mensajes en el historial de chat.",
        }

    ultimo_mensaje = historial[-1]["contenido"]
    proveedor = OpenAIProvider(variante="openai")

    # ── Clasificar intención ──
    intencion = await _clasificar_intencion(ultimo_mensaje, proveedor)

    # ── Responder pregunta ──
    if intencion == "responder" or intencion == "modificar_posiciones":
        resultado = await ejecutar_chat_agent(estado)
        resultado["intencion_detectada"] = intencion
        return resultado

    # ── Modificar netlist ──
    netlist_actual = estado.get("extractor_netlist")
    if not netlist_actual:
        return {
            "error": True,
            "mensaje": "No hay un netlist cargado para modificar.",
            "intencion_detectada": intencion,
        }

    try:
        netlist_modificado = await _aplicar_modificacion_netlist(
            mensaje=ultimo_mensaje,
            netlist_actual=netlist_actual,
            proveedor=proveedor,
        )
    except json.JSONDecodeError:
        return {
            "error": True,
            "mensaje": "No se pudo interpretar la modificación solicitada. ¿Puedes reformular el cambio?",
            "intencion_detectada": intencion,
        }

    # ── Disparar Planner con netlist modificado ──
    estado_para_planner = {
        **estado,
        "extractor_netlist": netlist_modificado,
        "extractor_exito": True,
        "extractor_intento": 0,
        "extractor_errores": [],
        "extractor_respuesta_raw": None,
        "extractor_tokens_entrada": 0,
        "extractor_tokens_salida": 0,
        "extractor_tiempo": 0.0,
    }

    resultado_planner = await ejecutar_planner(estado_para_planner)

    tiempo_total = round(time.time() - inicio, 2)

    if resultado_planner.get("error"):
        return {
            "error": True,
            "mensaje": "Se aplicó el cambio al netlist pero el Planner no pudo regenerar las instrucciones.",
            "netlist_modificado": netlist_modificado,
            "intencion_detectada": intencion,
            "uso": resultado_planner.get("uso", {}),
        }

    return {
        "error": False,
        "respuesta": f"Listo. Modifiqué el circuito según tu indicación y regeneré las instrucciones de armado.",
        "intencion_detectada": intencion,
        "netlist_modificado": netlist_modificado,
        "instrucciones_actualizadas": resultado_planner["instrucciones"],
        "uso": {
            **resultado_planner.get("uso", {}),
            "tiempo_total_segundos": tiempo_total,
        },
    }
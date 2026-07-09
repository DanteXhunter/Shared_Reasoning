import time
import json
from agents.estado import EstadoGlobal, MensajeChat
from providers.openai_provider import OpenAIProvider


SYSTEM_PROMPT = """Eres un asistente especializado en electrónica, circuitos eléctricos y ensamblaje en protoboard.

Tu función es ayudar al usuario a entender y armar correctamente el circuito. Tienes acceso al netlist del circuito (componentes y conexiones) y a las instrucciones de ensamblaje generadas para el protoboard.

Reglas estrictas:
- Responde ÚNICAMENTE preguntas relacionadas con electrónica, circuitos, componentes y protoboards.
- Si el usuario pregunta algo fuera de ese dominio, indica amablemente que solo puedes ayudar con temas de electrónica y circuitos.
- Usa el netlist y las instrucciones como fuente de verdad. No inventes componentes ni conexiones que no estén en el netlist.
- Responde en el mismo idioma en que el usuario te escribe.
- Sé claro y conciso. Si el usuario es principiante, usa lenguaje simple. Si demuestra conocimiento técnico, puedes usar términos más específicos.

Pensamiento crítico — esto es obligatorio:
- Si el usuario propone algo que es FÍSICAMENTE IMPOSIBLE en una protoboard (dos componentes en la misma fila, invertir la polaridad de un LED, etc.), díselo directamente y explica por qué no funciona. No lo valides.
- Si el usuario propone algo que PUEDE DAÑAR el circuito (cortocircuito, voltaje incorrecto, componente invertido), adviértelo con claridad antes de dar cualquier otra respuesta.
- Si el usuario cree algo INCORRECTO sobre electrónica, corrígelo con respeto pero sin ambigüedad. No confirmes ideas equivocadas para no contradecirlo.
- Si la propuesta del usuario es válida pero SUBÓPTIMA, díselo y sugiere la alternativa más eficiente.
- Solo valida una idea del usuario cuando realmente sea correcta. Dar la razón cuando el usuario está equivocado es peor que no responder.
"""


def _construir_contexto_circuito(estado: EstadoGlobal) -> str:
    netlist = estado.get("extractor_netlist")
    instrucciones = estado.get("planner_instrucciones")

    partes = []

    if netlist:
        partes.append(f"NETLIST DEL CIRCUITO:\n{json.dumps(netlist, ensure_ascii=False, indent=2)}")

    if instrucciones:
        partes.append(f"INSTRUCCIONES DE ENSAMBLAJE:\n{json.dumps(instrucciones, ensure_ascii=False, indent=2)}")

    if not partes:
        return "Aún no hay un circuito analizado. El usuario no ha subido ningún esquemático."

    return "\n\n".join(partes)


async def ejecutar_chat_agent(estado: EstadoGlobal) -> dict:
    """
    Chat Agent base: responde preguntas del usuario sobre el circuito.
    No modifica el estado — solo lee y responde.
    """
    inicio = time.time()

    proveedor = OpenAIProvider(variante="openai")

    historial: list[MensajeChat] = estado.get("historial_chat", [])

    if not historial:
        return {
            "error": True,
            "mensaje": "No hay mensajes en el historial de chat.",
        }

    contexto_circuito = _construir_contexto_circuito(estado)

    system_message = {
        "role": "system",
        "content": f"{SYSTEM_PROMPT}\n\n{contexto_circuito}"
    }

    mensajes_para_llm = [system_message]
    for msg in historial:
        mensajes_para_llm.append({
            "role": msg["rol"],
            "content": msg["contenido"]
        })

    try:
        ultimo_mensaje = historial[-1]["contenido"]
        historial_sin_ultimo = mensajes_para_llm[:-1]

        respuesta = await proveedor.client.chat.completions.create(
            model=proveedor.model,
            messages=historial_sin_ultimo + [{"role": "user", "content": ultimo_mensaje}],
        )

        tokens_entrada = respuesta.usage.prompt_tokens
        tokens_salida = respuesta.usage.completion_tokens
        contenido = respuesta.choices[0].message.content or ""
        tiempo = time.time() - inicio

        return {
            "error": False,
            "respuesta": contenido,
            "uso": {
                "tokens_entrada": tokens_entrada,
                "tokens_salida": tokens_salida,
                "tokens_total": tokens_entrada + tokens_salida,
                "modelo_activo": proveedor.model,
                "tiempo_segundos": round(tiempo, 2),
            }
        }

    except Exception as e:
        return {
            "error": True,
            "mensaje": f"Error al llamar al modelo: {str(e)}",
        }
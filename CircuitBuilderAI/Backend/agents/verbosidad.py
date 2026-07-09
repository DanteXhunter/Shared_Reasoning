"""
Capa de VERBOSIDAD por nivel (básico / intermedio / experto).

Separa la COMUNICACIÓN de la corrección eléctrica:
  - La geometría del plan la produce agents/topologia.py (determinística, correcta).
  - Aquí solo se REESCRIBE el texto ('descripcion') de cada paso según el nivel,
    y se ofrece el fragmento de reglas que el chat inyecta en su system prompt.

Reglas de nivel (definidas con el proyecto):
  básico     → explica QUÉ es cada componente (1ª vez) + el PORQUÉ de cada paso.
  intermedio → NO explica componentes comunes; SÍ el PORQUÉ de cada paso.
  experto    → PORQUÉ breve y técnico; conciso; listo para esquemas complejos.

nivel ≠ tipo de interacción (ver §8 del contexto del proyecto): el nivel controla
CUÁNTO se explica; el tipo de interacción (UNDER/OVER/…) es otro eje.
"""
from __future__ import annotations
import json
import time
from providers.openai_provider import OpenAIProvider

NIVELES_VALIDOS = {"basico", "intermedio", "experto"}
NIVEL_POR_DEFECTO = "intermedio"

REGLAS_NIVEL = {
    "basico": (
        "El usuario es PRINCIPIANTE: puede que nunca haya armado un circuito en protoboard.\n"
        "- Explica QUÉ ES cada componente la PRIMERA vez que aparece (para qué sirve, en una frase sencilla).\n"
        "- Explica el PORQUÉ de cada paso, no solo el qué.\n"
        "- Lenguaje cotidiano, sin jerga. Menciona rasgos físicos (color, forma, tamaño) para reconocer la pieza.\n"
        "- Da confianza y no asumas que sabe leer coordenadas de protoboard."
    ),
    "intermedio": (
        "El usuario tiene experiencia MEDIA: ya sabe qué es una resistencia, un LED o un capacitor.\n"
        "- NO expliques qué es un componente común. SÍ explica el PORQUÉ de cada paso.\n"
        "- Explica un componente SOLO si es poco común (ej. un 555, un regulador, un cristal).\n"
        "- Lenguaje técnico pero claro y directo."
    ),
    "experto": (
        "El usuario es EXPERTO en electrónica.\n"
        "- No expliques qué es ningún componente. Explica el PORQUÉ de cada paso de forma BREVE y técnica.\n"
        "- Sé conciso. Prepárate para esquemas complejos (chips, múltiples rieles, buses).\n"
        "- Usa terminología precisa (nodo, polarización, malla) sin rodeos."
    ),
}


def normalizar_nivel(nivel: str | None) -> str:
    n = (nivel or "").strip().lower()
    return n if n in NIVELES_VALIDOS else NIVEL_POR_DEFECTO


def reglas_nivel(nivel: str) -> str:
    """Fragmento de reglas de verbosidad — reutilizable en planner y chat."""
    return REGLAS_NIVEL[normalizar_nivel(nivel)]


def _coords(ins: dict) -> str:
    if ins.get("pines"):
        return ",".join(f"{p.get('columna','?')}{p.get('fila','?')}" for p in ins["pines"])
    if ins.get("cable"):
        c = ins["cable"]
        return f"{c['desde']['columna']}{c['desde']['fila']}→riel {c['hasta']['columna']}"
    return "-"


def aplicar_descripciones(instrucciones: list[dict], nuevas: dict[int, str]) -> list[dict]:
    """
    Devuelve las instrucciones con la 'descripcion' reemplazada por `nuevas`
    (mapa numero→texto). La GEOMETRÍA (pines, cable, coords) queda intacta.
    Si un paso no tiene texto nuevo válido, conserva el suyo.
    """
    salida = []
    for ins in instrucciones:
        texto = nuevas.get(ins.get("numero"))
        if isinstance(texto, str) and texto.strip():
            salida.append({**ins, "descripcion": texto.strip()})
        else:
            salida.append(ins)
    return salida


PROMPT_REDACTOR = """Eres un instructor de electrónica que redacta instrucciones para armar un circuito en una protoboard.

Te doy PASOS ya calculados con sus coordenadas físicas exactas. Tu ÚNICO trabajo es REESCRIBIR el texto ('descripcion') de cada paso según el nivel del usuario.
PROHIBIDO: cambiar coordenadas, agregar o quitar pasos, inventar componentes o conexiones.

NIVEL DEL USUARIO:
{reglas}

COMPONENTES DEL CIRCUITO (úsalos para tus explicaciones):
{componentes}

PASOS (numero · tipo · componente · coords · texto base):
{pasos}

Responde ÚNICAMENTE con este JSON, un objeto por paso con el MISMO numero, en español, sin markdown:
{{"descripciones": [{{"numero": 1, "descripcion": "..."}}]}}"""


async def redactar_plan(
    instrucciones: list[dict],
    nivel: str,
    netlist: dict | None,
    proveedor: str = "openai",
) -> tuple[list[dict], dict]:
    """
    Reescribe las descripciones de los pasos según el nivel (1 sola llamada LLM).
    Nunca toca la geometría. Si algo falla, devuelve las instrucciones tal cual
    (degradación elegante) — el plan siempre queda utilizable.
    """
    inicio = time.time()
    uso = {"tokens_entrada": 0, "tokens_salida": 0, "tokens_total": 0,
           "modelo_activo": "ninguno", "tiempo_segundos": 0.0}

    if not instrucciones:
        return instrucciones, uso

    componentes = (netlist or {}).get("componentes", [])
    comp_txt = "\n".join(
        f"- {c.get('id','?')}: {c.get('tipo','')} {c.get('valor','')}".rstrip()
        for c in componentes
    ) or "(sin lista de componentes)"
    pasos_txt = "\n".join(
        f"{i.get('numero')}. {i.get('tipo')} · {i.get('componente_id') or '-'} · {_coords(i)} · {i.get('descripcion','')}"
        for i in instrucciones
    )
    prompt = PROMPT_REDACTOR.format(reglas=reglas_nivel(nivel), componentes=comp_txt, pasos=pasos_txt)

    try:
        prov = OpenAIProvider(variante="openai")
        resp = await prov.client.chat.completions.create(
            model=prov.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        contenido = (resp.choices[0].message.content or "").strip()
        contenido = contenido.replace("```json", "").replace("```", "").strip()
        datos = json.loads(contenido)
        nuevas = {
            int(d["numero"]): d["descripcion"]
            for d in datos.get("descripciones", [])
            if "numero" in d and "descripcion" in d
        }
        instrucciones_redactadas = aplicar_descripciones(instrucciones, nuevas)
        uso = {
            "tokens_entrada": resp.usage.prompt_tokens,
            "tokens_salida": resp.usage.completion_tokens,
            "tokens_total": resp.usage.total_tokens,
            "modelo_activo": prov.model,
            "tiempo_segundos": round(time.time() - inicio, 2),
        }
        return instrucciones_redactadas, uso
    except Exception as e:
        # Degradación elegante: quedan las descripciones básicas de la capa determinística.
        uso["nota"] = f"redacción omitida: {str(e)[:120]}"
        uso["tiempo_segundos"] = round(time.time() - inicio, 2)
        return instrucciones, uso

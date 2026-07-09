"""
Capa de VERBOSIDAD por nivel (básico / intermedio / experto).

Reglas de nivel (definidas con el proyecto):
  básico     → explica QUÉ es cada componente (1ª vez) + el PORQUÉ de cada paso.
  intermedio → NO explica componentes comunes; SÍ el PORQUÉ de cada paso.
  experto    → PORQUÉ breve y técnico; conciso; listo para esquemas complejos.

nivel ≠ tipo de interacción (ver §8 del contexto del proyecto): el nivel controla
CUÁNTO se explica; el tipo de interacción (UNDER/OVER/…) es otro eje.

`reglas_nivel()` es el único punto de verdad de este texto — lo usan tanto
agents/planner_agent.py (para redactar los pasos del armado en la misma
llamada que propone la geometría) como agents/agent_chat.py (para el tono
de las respuestas del chat).
"""
from __future__ import annotations

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

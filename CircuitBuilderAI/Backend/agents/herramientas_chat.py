"""Herramientas (function calling) que el Chat Agent le declara al modelo.

Reemplaza al clasificador de intención escrito a mano: en vez de pedirle al
LLM un JSON `{"intencion": "..."}` dentro de un texto y parsearlo con
`json.loads` + `except JSONDecodeError`, se le declaran las acciones posibles
y el proveedor devuelve la elección ya estructurada y validada contra el
schema (#154).

Dos ganancias sobre el clasificador anterior, ambas de contexto:
- El modelo decide viendo la CONVERSACIÓN COMPLETA. El clasificador recibía
  solo el último mensaje suelto, así que "hazlo", "aplícalo" o "regenera eso"
  eran literalmente indecidibles.
- La decisión y sus argumentos quedan en el historial como un turno propio
  (rol `tool`), no como el texto enlatado "Listo. Modifiqué el circuito".

Decisiones de diseño:

1. `responder` TAMBIÉN es una herramienta, y se llama con `tool_choice="required"`.
   No es lo natural (lo natural sería "sin tool_call = responder"), pero
   garantiza que cada turno produzca exactamente una llamada, y eso es lo que
   permite el punto 2.

2. `tipo_interaccion` es un parámetro OBLIGATORIO de las cuatro herramientas.
   Semánticamente no es un argumento de la acción — es el diagnóstico de
   investigación del #82 (taxonomía IN/ON/OVER/UNDER/ALONG). Se mete acá a
   propósito: hoy viaja gratis dentro de la misma llamada del clasificador, y
   sacarlo a una llamada aparte costaría un request extra por cada mensaje del
   chat. Se prefiere ensuciar un poco el schema antes que duplicar el costo.

3. `modificar_netlist` NO recibe el netlist completo como argumento, solo la
   descripción del cambio; el netlist nuevo se genera en una segunda llamada
   (ver `_aplicar_modificacion_netlist`). Un netlist completo es JSON hondo y
   anidado, que es justo donde las capas OpenAI-compatibles de otros
   proveedores son más frágiles. `mover_componentes`, en cambio, sí lleva sus
   argumentos directos porque son planos ({"R1": 10}) — ahí sí se ahorra una
   llamada respecto de la versión anterior.
"""
from agents.deteccion_interaccion import TIPOS_VALIDOS

_PARAM_TIPO_INTERACCION = {
    "type": "string",
    "enum": TIPOS_VALIDOS,
    "description": (
        "Tipo de interacción humano-IA que refleja ESTE mensaje del usuario, "
        "según la taxonomía dada en el system prompt. Es un eje independiente "
        "de la acción que estás eligiendo y del nivel del usuario."
    ),
}


def _herramienta(nombre: str, descripcion: str, propiedades: dict, requeridos: list[str]) -> dict:
    """Arma una entrada de `tools` con `tipo_interaccion` ya incorporado, para
    no repetir ese bloque en las cuatro definiciones."""
    return {
        "type": "function",
        "function": {
            "name": nombre,
            "description": descripcion,
            "parameters": {
                "type": "object",
                "properties": {**propiedades, "tipo_interaccion": _PARAM_TIPO_INTERACCION},
                "required": [*requeridos, "tipo_interaccion"],
            },
        },
    }


HERRAMIENTAS = [
    _herramienta(
        "responder",
        "Responder una pregunta o comentario del usuario SIN cambiar el circuito. "
        "Úsala para dudas de electrónica, explicaciones de un paso, o charla que no "
        "pide ninguna modificación.",
        {},
        [],
    ),
    _herramienta(
        "modificar_netlist",
        "Cambiar la TOPOLOGÍA ELÉCTRICA del circuito: reconectar un pin a otro nodo, o "
        "agregar, quitar o reemplazar un componente (ej. 'agrega una resistencia "
        "limitadora', 'quita el LED', 'que aguante 20V'). Úsala aunque el usuario no "
        "nombre el pin o el nodo exacto.",
        {
            "cambio_solicitado": {
                "type": "string",
                "description": (
                    "El cambio eléctrico a aplicar, en una frase clara y autocontenida. "
                    "Si el usuario se refirió a algo dicho antes en la conversación "
                    "('hazlo', 'ese cambio'), resuélvelo aquí y escribe el cambio completo."
                ),
            }
        },
        ["cambio_solicitado"],
    ),
    _herramienta(
        "mover_componentes",
        "Reubicar uno o más componentes CONCRETOS en el protoboard, sin tocar la "
        "topología eléctrica. El usuario los nombra (por id o por descripción), con o "
        "sin número de fila.",
        {
            "overrides": {
                "type": "object",
                "description": (
                    "Filas exactas pedidas, como {id_componente: numero_de_fila} "
                    '(ej. {"R1": 10, "C2": 15}). Objeto vacío si el usuario no dio '
                    "ningún número concreto."
                ),
                "additionalProperties": {"type": "integer", "minimum": 1, "maximum": 30},
            },
            "instruccion_libre": {
                "type": "string",
                "description": (
                    "Solo cuando NO hay fila exacta: la petición reformulada para que la "
                    "interprete el planner (ej. 'mover R4 un lugar a la derecha y separar "
                    "el jumper'). Cadena vacía si ya diste overrides numéricos."
                ),
            },
        },
        [],
    ),
    _herramienta(
        "proponer_alternativa",
        "Generar una distribución DISTINTA a la actual cuando el usuario lo pide de "
        "forma general, sin nombrar componentes ni filas (ej. 'arma diferente', 'no me "
        "gusta cómo quedó', 'hazlo con menos cables'). La topología eléctrica no cambia.",
        {},
        [],
    ),
]

NOMBRES_HERRAMIENTAS = [h["function"]["name"] for h in HERRAMIENTAS]

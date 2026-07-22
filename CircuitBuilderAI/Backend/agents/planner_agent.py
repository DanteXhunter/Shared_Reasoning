from langgraph.graph import StateGraph, END
from openai import RateLimitError, APIError
from agents.estado import EstadoGlobal
from agents.topologia import construir_nets, es_fuente
from agents.validador import validar_instrucciones
from agents.verbosidad import reglas_nivel, normalizar_nivel
from providers.catalogo import (
    MODELOS_LANGGRAPH,
    crear_modelo_langgraph as crear_modelo,
    mensaje_rate_limit,
    es_error_freetier,
    grupo_credencial_de,
)
import json
import os
import time
from dotenv import load_dotenv

load_dotenv()

MAX_REINTENTOS = 3


# ─────────────────────────────────────────────
# PROMPT — la IA PROPONE el armado; agents/validador.py verifica la física.
#
# Deliberadamente NO se le entregan coordenadas precalculadas: es la IA quien
# decide dónde va cada componente y qué cables usar (como en cualquier
# ensamblaje real, hay muchas soluciones válidas). El código solo garantiza
# que la propuesta sea físicamente posible — si no lo es, se le devuelve el
# error exacto para que lo corrija, igual que ya hace el extractor con el
# netlist. Esto mantiene al humano y a la IA en el ciclo de decisión
# (Shared Reasoning), en vez de que el código decida el armado por su cuenta.
# ─────────────────────────────────────────────

REGLAS_FISICAS = """REGLAS FÍSICAS DE LA PROTOBOARD (no son negociables — son cómo funciona el objeto):
- 30 columnas numeradas ("fila" en el JSON, 1 a 30) y filas con letra ("columna" en el JSON, a-j).
- Cada número de fila tiene DOS strips INDEPENDIENTES: columnas a,b,c,d,e están conectadas ENTRE SÍ; columnas f,g,h,i,j están conectadas ENTRE SÍ; el lado a-e NO tiene relación eléctrica con el lado f-j (canal central).
- Los rieles ('columna': '+' y 'columna': '-') recorren TODO el tablero: cualquier hueco '+' está conectado a cualquier otro hueco '+', igual con '-'.
- Si dos pines DEBEN quedar eléctricamente conectados (mismo nodo del netlist), ponlos en el MISMO strip (misma fila, mismo lado a-e o f-j) o crea un cable directo entre sus huecos.
- Si dos pines NO deben conectarse entre sí, NUNCA los pongas en el mismo strip — eso los cortocircuita.
- Dale a cada componente su PROPIO tramo: lo normal es que sus 2 patas queden en la MISMA fila, una en columna 'a' y la otra en columna 'f' (cruza el canal central, no se corta con otro componente). Componentes de 3+ patas usan varias filas consecutivas, todas en columna 'a' (cada número de fila es su propio strip independiente).
- La FUENTE (batería) es un caso especial: sus 2 pines SIEMPRE van en columna '+' y columna '-' (el riel), NUNCA en columnas de strip normal (a-e o f-j) — ni siquiera 'a' y 'b', que parecen distintas pero están en el MISMO strip y la cortocircuitan. El riel ignora el número de fila: cualquier '+' toca cualquier otro '+', así que puedes usar la misma fila para ambos pines sin problema, mientras uno sea columna '+' y el otro columna '-'.
- Nombres como VCC, GND, V+, V-, TIERRA que aparezcan en el netlist NO son huecos físicos — son ALIAS del riel. Si el netlist tiene una conexión hacia "VCC" o "GND", ya queda resuelta con que el pin correspondiente esté en el riel '+' o '-'. NUNCA inventes un cable "hasta columna VCC" o "hasta columna GND" — esas letras no son columnas válidas del tablero."""

PROMPT_PLANIFICAR = """Eres un experto armando circuitos en una protoboard (breadboard) estándar de 830 puntos.

{reglas_fisicas}

NETLIST DEL CIRCUITO (arma EXACTAMENTE estas conexiones, ni más ni menos):
{netlist}

NODOS ELÉCTRICOS DEL CIRCUITO (ya agrupados a partir del netlist — la MISMA verdad eléctrica contra la que se validará tu propuesta):
{nodos_electricos}

Usa estos nodos como tu punto de partida — no re-deduzcas la topología desde las conexiones sueltas del netlist. La regla es simple:
- TODOS los pines listados en un mismo NODO deben terminar eléctricamente unidos (mismo strip, o cables entre sus huecos, o ambos en el mismo riel).
- Pines de NODOS distintos NUNCA pueden compartir strip ni riel.
- Un nodo marcado "positivo" debe llegar al riel '+'; uno marcado "negativo", al riel '-'.
- CADA COMPONENTE OCUPA SU PROPIO HUECO: dos componentes DISTINTOS nunca pueden tener una pata en la MISMA fila+columna exacta — eso es físicamente imposible (un hueco es para una sola pata). Cuando varios componentes comparten nodo, únelos de una de estas dos formas, NUNCA reusando la misma coordenada: (a) cada uno en una columna DIFERENTE del mismo strip (ej. fila 2: uno en 'a', otro en 'b', otro en 'c'), o (b) cada uno en su propia fila, conectados entre sí con cables.

SUGERENCIA DE DISTRIBUCIÓN BASE (punto de partida ordenado — puedes ajustarlo si tu razonamiento eléctrico lo amerita, pero evita amontonar varios componentes en las mismas filas):
{distribucion_base}

{peticion_alternativa}{restriccion_usuario}NIVEL DEL USUARIO (ajusta CUÁNTO explicas en la 'descripcion' de cada paso — la geometría no cambia por esto):
{reglas_nivel}

{errores_previos}Genera las instrucciones de armado. Responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin bloques de código markdown.

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
                {{"nombre": "pin1", "fila": 5, "columna": "a"}},
                {{"nombre": "pin2", "fila": 5, "columna": "f"}}
            ],
            "cable": null
        }},
        {{
            "numero": 2,
            "tipo": "colocar_componente",
            "componente_id": "LED1",
            "componente_tipo": "led",
            "componente_valor": "N/A",
            "descripcion": "Instrucción en lenguaje natural clara para el usuario",
            "pines": [
                {{"nombre": "anodo", "fila": 8, "columna": "a"}},
                {{"nombre": "catodo", "fila": 8, "columna": "f"}}
            ],
            "cable": null
        }},
        {{
            "numero": 3,
            "tipo": "conectar_cable",
            "componente_id": null,
            "componente_tipo": null,
            "componente_valor": null,
            "descripcion": "R1 y LED1 están en serie: une la pata de salida de R1 con el ánodo de LED1 (mismo nodo eléctrico, filas distintas → hace falta cable)",
            "pines": null,
            "cable": {{
                "color": "amarillo",
                "desde": {{"fila": 5, "columna": "f"}},
                "hasta": {{"fila": 8, "columna": "a"}}
            }}
        }},
        {{
            "numero": 4,
            "tipo": "conectar_cable",
            "componente_id": null,
            "componente_tipo": null,
            "componente_valor": null,
            "descripcion": "Instrucción en lenguaje natural clara para el usuario",
            "pines": null,
            "cable": {{
                "color": "rojo",
                "desde": {{"fila": 5, "columna": "a"}},
                "hasta": {{"fila": 1, "columna": "+"}}
            }}
        }},
        {{
            "numero": 5,
            "tipo": "conectar_cable",
            "componente_id": null,
            "componente_tipo": null,
            "componente_valor": null,
            "descripcion": "Cátodo de LED1 a tierra",
            "pines": null,
            "cable": {{
                "color": "negro",
                "desde": {{"fila": 8, "columna": "f"}},
                "hasta": {{"fila": 1, "columna": "-"}}
            }}
        }},
        {{
            "numero": 6,
            "tipo": "colocar_componente",
            "componente_id": "BAT1",
            "componente_tipo": "fuente",
            "componente_valor": "9V",
            "descripcion": "Con todo el circuito ya armado y cableado, conecta por último la fuente: pin positivo en el riel '+' y pin negativo en el riel '-'. Así verificas el armado completo ANTES de energizarlo.",
            "pines": [
                {{"nombre": "plus", "fila": 1, "columna": "+"}},
                {{"nombre": "minus", "fila": 1, "columna": "-"}}
            ],
            "cable": null
        }}
    ]
}}

El ejemplo anterior ilustra dos cosas: (1) el caso MÁS COMÚN — dos componentes DISTINTOS que comparten un nodo (R1 en serie con LED1). Cuando eso pase en tu netlist, tienes dos opciones válidas — (a) ponlos en filas donde sus pines caigan en el MISMO strip (mismo número de fila, mismo lado a-e o f-j), o (b) ponlos en filas distintas y agrega un cable entre sus huecos. Usa la que te dé un armado más ordenado. NO dejes esa conexión sin traducir a ninguna de las dos formas — es el error más común. (2) La FUENTE (batería) es el ÚLTIMO paso, no el primero — ver regla de seguridad abajo.

Ejemplo adicional — componente de 3 patas (transistor Q1, base/colector/emisor):
{{
    "numero": N,
    "tipo": "colocar_componente",
    "componente_id": "Q1",
    "componente_tipo": "transistor",
    "componente_valor": "N/A",
    "descripcion": "...",
    "pines": [
        {{"nombre": "base", "fila": 10, "columna": "a"}},
        {{"nombre": "colector", "fila": 11, "columna": "a"}},
        {{"nombre": "emisor", "fila": 12, "columna": "a"}}
    ],
    "cable": null
}}
Nota: las 3 patas van en 3 FILAS CONSECUTIVAS distintas, todas en columna "a" (o todas en "f") — NUNCA las 3 en la misma fila (eso las cortocircuita entre sí, porque a-e es un solo strip). Cada fila es su propio strip independiente, así que cada pata queda aislada de las otras dos hasta que tú decidas conectarlas con cables.

Reglas de salida:
- Un paso "colocar_componente" por CADA componente del netlist, incluida la fuente (su pin positivo en columna "+", su pin negativo en columna "-").
- Un paso "conectar_cable" por cada cable que haga falta para que TODAS las conexiones del netlist queden completas — no dejes ninguna conexión sin traducir a strip compartido o cable.
- Colores de cable: rojo para el positivo/VCC, negro para negativo/GND, cualquier otro color (verde, azul, amarillo) para señal entre componentes.
- ORDEN DE LOS PASOS (regla de seguridad): coloca primero TODOS los componentes que NO sean la fuente, luego conecta TODOS los cables (incluidos los que llegan al riel '+'/'-' — el riel existe como strip físico aunque la fuente todavía no esté puesta), y coloca la FUENTE (batería) en el ÚLTIMO paso de todos. Así el usuario arma y verifica el circuito completo ANTES de energizarlo — conectar la alimentación al final reduce el riesgo de que un error de armado a medio construir cause un corto con la fuente ya puesta.
- La descripción debe adaptarse al nivel del usuario indicado.
- "Arma EXACTAMENTE estas conexiones" se refiere a la TOPOLOGÍA ELÉCTRICA (qué nodos quedan unidos entre sí), no a la geometría: la fila y columna exactas de cada componente son tu libre elección, siempre que respetes las reglas físicas.

Antes de responder, verifica mentalmente:
[ ] ¿Cada componente tiene un paso "colocar_componente" con TODAS sus patas?
[ ] ¿La fuente (si existe) tiene sus 2 pines en columna '+' y '-', nunca en a-e/f-j?
[ ] ¿El paso de colocar la FUENTE es el ÚLTIMO de toda la lista (después de todos los demás componentes y cables)?
[ ] Para cada conexión del netlist entre dos pines de componentes DISTINTOS: ¿quedó resuelta por strip compartido O por un cable explícito? (repasa una por una, no asumas)
[ ] ¿Ningún par de pines que deben quedar SEPARADOS terminó en el mismo strip por accidente?
[ ] ¿Usé colores de cable según la convención (rojo=VCC, negro=GND, otro=señal)?
"""


def serializar_nets(netlist: dict) -> str:
    """
    Convierte los nodos eléctricos de construir_nets() en texto legible para
    el prompt del planner. Es la MISMA fuente que usa el validador — así la IA
    razona desde los grupos ya resueltos (el cimiento del armado) en vez de
    re-deducir la topología del netlist plano, que era su error más común.
    """
    nets, _ = construir_nets(netlist)
    etiquetas = {
        "positivo": "positivo — debe llegar al riel '+'",
        "negativo": "negativo — debe llegar al riel '-'",
    }
    lineas = []
    for i, net in enumerate(nets, 1):
        etiqueta = etiquetas.get(net["tipo"], "señal")
        pines = ", ".join(f"{cid}.{pin}" for cid, pin in net["pines"])
        alias = f" (alias en el netlist: {', '.join(net['nodos'])})" if net["nodos"] else ""
        lineas.append(f"- NODO {i} ({etiqueta}): {pines}{alias}")
    return "\n".join(lineas)


def sugerir_distribucion_base(netlist: dict) -> str:
    """
    Sugiere una fila DEDICADA por componente (la fuente queda fuera — va a los
    rieles, no a un strip), en el orden del netlist. Es solo un punto de
    partida ordenado para reducir el riesgo de que el modelo intente ahorrarse
    huecos reusando la misma coordenada para componentes distintos (causa real
    observada: varias patas de componentes diferentes apiladas en un solo
    hueco). El LLM sigue libre de ajustar esto si el circuito lo amerita.
    """
    lineas = []
    fila = 2
    for c in netlist.get("componentes", []):
        if es_fuente(c):
            continue
        pines = c.get("pines", [])
        n = len(pines)
        if n <= 0:
            continue
        if n <= 2:
            lineas.append(f"- {c['id']}: fila {fila} (una pata en columna 'a', la otra en 'f')")
            fila += 1
        else:
            filas_usadas = ", ".join(str(fila + i) for i in range(n))
            lineas.append(f"- {c['id']}: filas {filas_usadas} (una pata por fila, todas en columna 'a')")
            fila += n
    return "\n".join(lineas) if lineas else "(sin componentes de strip — solo fuente)"


def serializar_layout_previo(instrucciones: list[dict]) -> str:
    """
    Resume una lista de instrucciones YA generada (solo los pasos
    'colocar_componente') a texto compacto, para el pedido abierto "arma
    diferente" (intención proponer_alternativa en chat_agent_v2.py). El
    planner la usa como "esto NO lo repitas" — la topología eléctrica sigue
    intacta, solo cambia qué fila/columna ocupa cada componente.
    """
    lineas = []
    for paso in instrucciones or []:
        if paso.get("tipo") != "colocar_componente" or not paso.get("pines"):
            continue
        pines = ", ".join(f"{p['nombre']}={p['fila']}{p['columna']}" for p in paso["pines"])
        lineas.append(f"- {paso.get('componente_id')}: {pines}")
    return "\n".join(lineas) if lineas else "(sin distribución previa registrada)"


def nodo_planificar(estado: EstadoGlobal) -> dict:
    inicio = time.time()
    # Mismo criterio que ejecutar_planner: el planner usa el modelo de
    # razonamiento, con el de visión como respaldo si no vino especificado.
    modelo = crear_modelo(
        estado.get("proveedor_razon") or estado["proveedor"],
        estado.get("api_key_razon"),
    )
    netlist = estado["extractor_netlist"]
    intento = estado["planner_intento"]
    errores = estado["planner_errores"]
    reglas_nivel_texto = reglas_nivel(normalizar_nivel(estado.get("nivel")))

    # Petición del usuario vía chat ("pon R1 en la fila 10") — se le pasa a la
    # IA como restricción a respetar, NO como algo que el código aplique
    # directo: si no es eléctricamente posible, es la IA quien debe explicarlo
    # y proponer la alternativa más cercana.
    overrides = estado.get("planner_posiciones_override")
    restriccion_usuario = ""
    if overrides:
        lineas = "\n".join(f"- {comp_id}: el usuario pidió la fila {fila}" for comp_id, fila in overrides.items())
        restriccion_usuario = (
            "PETICIÓN DEL USUARIO (respétala si es eléctricamente posible; si genera un "
            f"conflicto, explícalo brevemente en la descripción del paso y usa la alternativa más cercana que sí funcione):\n{lineas}\n\n"
        )

    # Pedido de reubicación SIN fila exacta (ej. "mueve R4 a la derecha", "dale
    # más espacio al jumper") — el usuario nombró un componente concreto pero
    # no un número, así que se le pasa en sus propias palabras: el LLM debe
    # identificar a qué componente(s) se refiere y ajustar solo lo necesario,
    # dejando el resto de la distribución igual si es razonable.
    restriccion_libre = estado.get("planner_restriccion_libre")
    if restriccion_libre:
        restriccion_usuario += (
            "PETICIÓN ADICIONAL DEL USUARIO, EN SUS PROPIAS PALABRAS (no dio fila exacta — "
            "identifica tú el componente y aplica un ajuste razonable; respétala si es "
            f"eléctricamente posible):\n{restriccion_libre}\n\n"
        )

    errores_previos = ""
    if intento > 0 and errores:
        errores_previos = f"ERRORES DE TU PROPUESTA ANTERIOR QUE DEBES CORREGIR:\n{errores[-1]}\n\n"

    layout_previo = estado.get("planner_layout_previo")
    peticion_alternativa = ""
    if layout_previo:
        peticion_alternativa = (
            "EL USUARIO PIDIÓ UNA DISTRIBUCIÓN DIFERENTE A LA ACTUAL (la topología "
            "eléctrica NO cambia, solo la geometría). Esta fue la distribución "
            "anterior — NO la repitas, cambia la fila y/o columna de al menos varios "
            f"componentes:\n{serializar_layout_previo(layout_previo)}\n\n"
        )

    prompt = PROMPT_PLANIFICAR.format(
        reglas_fisicas=REGLAS_FISICAS,
        netlist=json.dumps(netlist, ensure_ascii=False, indent=2),
        nodos_electricos=serializar_nets(netlist),
        distribucion_base=sugerir_distribucion_base(netlist),
        peticion_alternativa=peticion_alternativa,
        restriccion_usuario=restriccion_usuario,
        reglas_nivel=reglas_nivel_texto,
        errores_previos=errores_previos,
    )

    mensajes = [{"role": "user", "content": prompt}]
    respuesta = modelo.invoke(mensajes)

    tokens_entrada = respuesta.usage_metadata.get("input_tokens", 0) if respuesta.usage_metadata else 0
    tokens_salida = respuesta.usage_metadata.get("output_tokens", 0) if respuesta.usage_metadata else 0

    return {
        "planner_respuesta_raw": respuesta.content,
        "planner_intento": intento + 1,
        # Costo de ESTE intento únicamente (no acumulado) — nodo_validar_plan
        # lo cierra con el resultado de la validación y lo agrega a
        # planner_intentos_detalle (#95: desglose por intento, no solo el total).
        "planner_tokens_entrada": tokens_entrada,
        "planner_tokens_salida": tokens_salida,
        "planner_tiempo": round(time.time() - inicio, 2),
    }


def nodo_validar_plan(estado: EstadoGlobal) -> dict:
    texto_raw = estado["planner_respuesta_raw"] or ""
    texto = texto_raw.strip().replace("```json", "").replace("```", "").strip()

    # Costo de ESTE intento (ver nodo_planificar) — se cierra acá con el
    # resultado de la validación y se agrega al desglose por intento (#95).
    registro_base = {
        "numero": estado["planner_intento"],
        "tokens_entrada": estado["planner_tokens_entrada"],
        "tokens_salida": estado["planner_tokens_salida"],
        "tokens_total": estado["planner_tokens_entrada"] + estado["planner_tokens_salida"],
        "tiempo_segundos": estado["planner_tiempo"],
    }

    def _fallo(error: str) -> dict:
        return {
            "planner_errores": estado["planner_errores"] + [error],
            "planner_exito": False,
            "planner_intentos_detalle": estado["planner_intentos_detalle"] + [{**registro_base, "exito": False, "error": error}],
        }

    try:
        datos = json.loads(texto)
    except json.JSONDecodeError as e:
        return _fallo(f"JSON inválido: {str(e)}")

    if "pasos" not in datos or len(datos["pasos"]) == 0:
        return _fallo("El JSON no contiene pasos o la lista está vacía")

    for paso in datos["pasos"]:
        if "numero" not in paso or "tipo" not in paso or "descripcion" not in paso:
            return _fallo(f"Paso incompleto: falta numero, tipo o descripcion en {paso}")

    # La física NO es negociable: se valida la propuesta de la IA contra la
    # verdad eléctrica del netlist. Si algo está mal, se rebota el detalle
    # exacto para que la IA lo corrija en el siguiente intento.
    netlist = estado["extractor_netlist"]
    errores_fisica = validar_instrucciones(netlist, datos["pasos"])
    if errores_fisica:
        resumen = "\n".join(f"- {e}" for e in errores_fisica)
        return _fallo(resumen)

    return {
        "planner_instrucciones": datos["pasos"],
        "planner_exito": True,
        "planner_intentos_detalle": estado["planner_intentos_detalle"] + [{**registro_base, "exito": True, "error": None}],
    }


def decidir_siguiente_plan(estado: EstadoGlobal) -> str:
    if estado["planner_exito"]:
        return END
    if estado["planner_intento"] >= MAX_REINTENTOS:
        return END
    return "planificar"


def crear_grafo_planner():
    grafo = StateGraph(EstadoGlobal)

    grafo.add_node("planificar", nodo_planificar)
    grafo.add_node("validar_plan", nodo_validar_plan)

    grafo.set_entry_point("planificar")
    grafo.add_edge("planificar", "validar_plan")
    grafo.add_conditional_edges("validar_plan", decidir_siguiente_plan, {END: END, "planificar": "planificar"})

    return grafo.compile()


async def ejecutar_planner(estado_extractor: dict) -> dict:
    """
    La IA PROPONE el armado completo (dónde va cada componente, qué cables
    usar); agents/validador.py verifica que esa propuesta sea físicamente
    correcta (sin cortos, sin conexiones perdidas, fuente conectada al riel).
    Si no lo es, se reintenta con el error exacto — igual que el extractor.
    """
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
        "planner_intentos_detalle": [],
    }

    grafo = crear_grafo_planner()
    # El planner razona sobre texto/JSON — no ve la imagen — así que usa el
    # modelo de razonamiento elegido, no el de visión. Si no se especificó
    # (llamadas antiguas o sesiones previas al selector), cae al de visión.
    proveedor = estado_extractor.get("proveedor_razon") or estado_extractor["proveedor"]
    config = MODELOS_LANGGRAPH.get(proveedor, {})
    modelo_activo = config.get("model", "desconocido")

    try:
        estado_final = await grafo.ainvoke(estado_inicial)
    except RateLimitError as e:
        # Ver nota equivalente en extractor_agent.py: sin esto, la excepción
        # escapaba sin manejar y el 500 resultante llegaba sin headers de CORS.
        mensaje, detalle = mensaje_rate_limit(proveedor, modelo_activo, e)
        api_key_razon_override = estado_extractor.get("api_key_razon")
        return {
            "error": True,
            "mensaje": mensaje,
            "errores": [detalle],
            # Ver nota equivalente en extractor_agent.py — confirmación real de
            # falta de facturación en la key propia del usuario.
            "sin_facturacion_grupo": (
                grupo_credencial_de(proveedor)["id"]
                if api_key_razon_override and es_error_freetier(e) and grupo_credencial_de(proveedor)
                else None
            ),
            "uso": {
                "tokens_entrada": 0, "tokens_salida": 0, "tokens_total": 0,
                "intentos": 0, "modelo_activo": modelo_activo, "tiempo_segundos": 0.0,
            },
        }
    except APIError as e:
        return {
            "error": True,
            "mensaje": f"El proveedor '{proveedor}' no respondió correctamente. Intenta de nuevo o cambia de modelo.",
            "errores": [str(e)],
            "uso": {
                "tokens_entrada": 0, "tokens_salida": 0, "tokens_total": 0,
                "intentos": 0, "modelo_activo": modelo_activo, "tiempo_segundos": 0.0,
            },
        }

    intentos_detalle = estado_final["planner_intentos_detalle"]
    uso = {
        # Derivados del desglose por intento (#95) — una sola fuente de verdad,
        # en vez de mantener un acumulado aparte que se puede desincronizar.
        "tokens_entrada": sum(d["tokens_entrada"] for d in intentos_detalle),
        "tokens_salida": sum(d["tokens_salida"] for d in intentos_detalle),
        "tokens_total": sum(d["tokens_total"] for d in intentos_detalle),
        "intentos": estado_final["planner_intento"],
        "modelo_activo": modelo_activo,
        "tiempo_segundos": round(sum(d["tiempo_segundos"] for d in intentos_detalle), 2),
        "intentos_detalle": intentos_detalle,
    }

    if estado_final["planner_exito"]:
        return {
            "instrucciones": estado_final["planner_instrucciones"],
            "uso": uso,
        }

    return {
        "error": True,
        "mensaje": f"No se pudo generar un plan eléctricamente válido después de {estado_final['planner_intento']} intentos.",
        "errores": estado_final["planner_errores"],
        "uso": uso,
    }

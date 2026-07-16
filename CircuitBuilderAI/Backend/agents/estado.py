from typing import TypedDict, Optional
from enum import Enum


class ModoInteraccion(str, Enum):
    UNDER = "UNDER"
    OVER = "OVER"
    ALONG = "ALONG"
    IN = "IN"
    ON = "ON"


class MensajeChat(TypedDict):
    rol: str
    contenido: str


class PosicionPin(TypedDict):
    fila: int
    columna: str


class PasoInstruccion(TypedDict):
    numero: int
    tipo: str
    componente: str
    descripcion: str
    posicion: Optional[dict]
    color: Optional[str]


class MetricasAgente(TypedDict):
    tokens_entrada: int
    tokens_salida: int
    tokens_total: int
    intentos: int
    modelo_activo: str
    tiempo_segundos: float


class EstadoGlobal(TypedDict):
    # Entrada
    imagen_base64: str
    mime_type: str
    proveedor: str
    # Modelo para tareas de razonamiento (planner + chat: clasificar, modificar
    # netlist/posiciones, responder) — separado del `proveedor` de visión, que
    # solo usa el extractor. Ver providers/catalogo.py (roles "vision"/"razon").
    proveedor_razon: str
    # API key propia del usuario para cada slot (opcional). Si viene vacía,
    # se usa la del servidor (ver providers/catalogo.py api_key_de). Nunca se
    # persiste — solo viaja en la petición.
    api_key: str
    api_key_razon: str
    modo_interaccion: ModoInteraccion
    # basico | intermedio | experto — controla CUÁNTO explica la IA (§8: nivel
    # ≠ tipo de interacción). Ver agents/verbosidad.py.
    nivel: str

    # Historial de chat
    historial_chat: list[MensajeChat]

    # Extractor
    extractor_intento: int
    extractor_errores: list[str]
    extractor_respuesta_raw: Optional[str]
    extractor_netlist: Optional[dict]
    extractor_exito: bool
    extractor_tokens_entrada: int
    extractor_tokens_salida: int
    extractor_tiempo: float

    # Planner
    planner_intento: int
    planner_errores: list[str]
    planner_respuesta_raw: Optional[str]
    planner_instrucciones: Optional[list[dict]]
    planner_exito: bool
    planner_tokens_entrada: int
    planner_tokens_salida: int
    planner_tiempo: float
    planner_posiciones_override: Optional[dict]  # {comp_id: fila} — sobrescribe calcular_posiciones()
    # Distribución previa a NO repetir (pedido abierto "arma diferente" — ver
    # agents/chat_agent_v2.py intención "proponer_alternativa"). Es la misma
    # lista que ya vive en planner_instrucciones; se pasa aparte porque solo
    # aplica a esa intención, no a cada corrida del planner.
    planner_layout_previo: Optional[list[dict]]
    # Petición de reubicación en lenguaje natural, sin fila exacta (ej. "mueve
    # R4 a la derecha y dale más espacio al jumper") — ver
    # agents/chat_agent_v2.py _aplicar_modificacion_posiciones. Se pasa como
    # restricción al planner igual que planner_posiciones_override, pero sin
    # forzar un número de fila que el usuario nunca dio.
    planner_restriccion_libre: Optional[str]
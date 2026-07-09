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
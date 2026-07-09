"""Rate limiting en memoria (#76).

Dos capas independientes:
  1. Presupuesto de tokens por (usuario, modelo), reset diario → protege los
     créditos del MLLM. Admins y modelos locales quedan exentos.
  2. Frecuencia de peticiones (ventana corta) → protege el servidor del
     martilleo. Aplica a todos, incluidos admins y modelos locales.

Todo vive en RAM: se reinicia con el proceso y asume una sola instancia del
backend (ver decisión de diseño del #76). Si algún día se escala a varias
instancias, este módulo es el único lugar a cambiar (p. ej. moviéndolo a Redis).
"""

import time
from datetime import date

from fastapi import HTTPException

from metricas import LIMITES

# --- Configuración ---

# Presupuesto de tokens por usuario y modelo, por día. Los modelos no listados
# usan el default. Los modelos locales (tipo "local" en metricas.LIMITES) están
# exentos, por eso no aparecen aquí.
PRESUPUESTO_TOKENS_DIA = {
    "openai": 500_000,
    "gemini": 1_000_000,
    "gemini-free": 1_000_000,
    "nemotron": 1_000_000,
    "llama-vision": 1_000_000,
}
PRESUPUESTO_TOKENS_DIA_DEFAULT = 500_000

# Frecuencia de peticiones: (peticiones, ventana_en_segundos).
FRECUENCIA_LLM = (60, 60)     # 60 por minuto, por usuario
FRECUENCIA_AUTH = (20, 60)    # 20 por minuto, por IP


# --- Estado en memoria ---

# {(usuario_id, modelo): [fecha, tokens_acumulados_hoy]}
_tokens_usadas: dict = {}
# {clave: [timestamps]} — ventana deslizante de frecuencia
_peticiones: dict = {}


def _es_local(proveedor: str) -> bool:
    return LIMITES.get(proveedor, {}).get("tipo") == "local"


def verificar_frecuencia(clave: str, limite_ventana=FRECUENCIA_LLM) -> None:
    """Lanza 429 si `clave` ya superó su cupo de peticiones dentro de la ventana.
    Usa una ventana deslizante de timestamps."""
    limite, ventana = limite_ventana
    ahora = time.monotonic()
    marcas = [t for t in _peticiones.get(clave, []) if ahora - t < ventana]

    if len(marcas) >= limite:
        espera = int(ventana - (ahora - marcas[0])) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Demasiadas peticiones. Espera ~{espera} segundos.",
        )

    marcas.append(ahora)
    _peticiones[clave] = marcas


def verificar_presupuesto_tokens(usuario, proveedor: str) -> None:
    """Lanza 429 si el usuario ya agotó su presupuesto diario de tokens para ese
    modelo. Admins y modelos locales quedan exentos. Se evalúa el acumulado
    previo: la petición que cruza el umbral aún se ejecuta (sobregiro de ~1)."""
    if usuario.es_admin or _es_local(proveedor):
        return

    registro = _tokens_usadas.get((str(usuario.id), proveedor))
    if registro is None or registro[0] != date.today():
        return  # sin consumo hoy → permitido

    limite = PRESUPUESTO_TOKENS_DIA.get(proveedor, PRESUPUESTO_TOKENS_DIA_DEFAULT)
    if registro[1] >= limite:
        raise HTTPException(
            status_code=429,
            detail=f"Alcanzaste tu límite diario de tokens para '{proveedor}'. "
                   f"Cambia de modelo o vuelve mañana.",
        )


def registrar_tokens_usuario(usuario, proveedor: str, tokens: int) -> None:
    """Acumula los tokens gastados por (usuario, modelo) en el día. No cuenta a
    admins ni a modelos locales (no tienen presupuesto que agotar)."""
    if usuario.es_admin or _es_local(proveedor) or tokens <= 0:
        return

    clave = (str(usuario.id), proveedor)
    hoy = date.today()
    registro = _tokens_usadas.get(clave)
    if registro is None or registro[0] != hoy:
        _tokens_usadas[clave] = [hoy, tokens]
    else:
        registro[1] += tokens

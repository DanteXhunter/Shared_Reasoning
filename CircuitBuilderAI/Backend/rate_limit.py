"""Rate limiting en memoria (#76).

Solo control de frecuencia (anti-flood): protege el servidor de martilleo de
peticiones, aplica a todos los usuarios por igual.

El presupuesto de tokens por usuario (con exención para admins) se quitó: el
proyecto pasó a usar las API keys de la cuenta común de Paralelo en `.env`, así
que el gasto ya es compartido y consciente entre el equipo — no hace falta
una cuota individual por usuario. Ver comentario de cierre en el issue #76.

Todo vive en RAM: se reinicia con el proceso y asume una sola instancia del
backend. Si algún día se escala a varias instancias, este módulo es el único
lugar a cambiar (p. ej. moviéndolo a Redis).
"""

import time

from fastapi import HTTPException

# Frecuencia de peticiones: (peticiones, ventana_en_segundos).
FRECUENCIA_LLM = (60, 60)     # 60 por minuto, por usuario
FRECUENCIA_AUTH = (20, 60)    # 20 por minuto, por IP


# --- Estado en memoria ---

# {clave: [timestamps]} — ventana deslizante de frecuencia
_peticiones: dict = {}


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

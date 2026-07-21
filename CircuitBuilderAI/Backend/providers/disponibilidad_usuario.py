"""Verifica en vivo qué modelos del catálogo puede usar una API key propia
del usuario (candado en el selector del front, ver SelectorModelo.tsx).

No se cachea en BD a propósito: es la misma llamada real y barata (sin costo
de tokens) que ya usa MLLMProvider, así que repetirla en cada carga es más
simple que invalidar un caché cuando el usuario arregla su facturación o
cambia de key. Confirma "esta key tiene acceso a este modelo", no "el modelo
está arriba ahora mismo" — eso lo siguen cubriendo los mensajes de 429/503 de
catalogo.mensaje_rate_limit.

El listado de /models NO basta para los modelos de categoría "pago": Google
devuelve el catálogo completo tenga o no facturación activa el proyecto.

Para OpenAI, una llamada mínima real SÍ resuelve la duda: sin facturación
responde 429 "insufficient_quota" de inmediato, sin importar cuánto se haya
usado la key antes (confirmado con una key real sin billing).

Para Gemini, la misma llamada NO sirve como prueba: Google regala una cuota
gratuita de cortesía a TODA key, tenga o no facturación, y el 429 "FreeTier"
solo aparece cuando esa cuota ya se gastó de verdad — nunca en una llamada
de prueba aislada. Se comprobó con 3 señales distintas (listado, un modelo
"flash", el modelo "pro-preview") y las tres dieron el mismo resultado tanto
con una key sin facturación como con una que sí paga — ninguna distingue.
Por eso, para Gemini los modelos de categoría "pago" que el listado confirma
se devuelven como "sin verificar" en vez de fingir que se comprobaron: es
honesto sobre el límite real en vez de mostrar una certeza que no existe.
"""

from openai import AsyncOpenAI

from providers.catalogo import CATALOGO, GRUPOS_CREDENCIAL


def _env_del_grupo(grupo_id: str) -> str:
    return next(env for env, g in GRUPOS_CREDENCIAL.items() if g["id"] == grupo_id)


def _base_url_del_grupo(grupo_id: str) -> str | None:
    env = _env_del_grupo(grupo_id)
    return next(cfg["base_url"] for cfg in CATALOGO.values() if cfg["api_key_env"] == env)


def _modelos_reales_del_grupo(grupo_id: str) -> dict[str, str]:
    """clave del catálogo -> nombre real del modelo, solo para este grupo."""
    env = _env_del_grupo(grupo_id)
    return {
        clave: cfg["model"]
        for clave, cfg in CATALOGO.items()
        if cfg["api_key_env"] == env
    }


async def _tiene_facturacion(cliente: AsyncOpenAI, modelo_de_prueba: str) -> bool:
    """Llamada real mínima (1 token de salida) para confirmar que la key
    puede de verdad usar un modelo de categoría "pago". Señal usada hoy:
    OpenAI con 429 "insufficient_quota" — inmediato, no depende de cuánto se
    haya usado la key (ver docstring del módulo). No se llama para Gemini —
    ahí esta prueba no distingue nada, ver módulo.

    Cualquier otro fallo (503 saturado, timeout, rate limit normal de una
    cuenta que sí paga) NO es evidencia de falta de facturación, así que no
    bloquea — se prefiere un falso "disponible" ocasional a un falso candado."""
    try:
        await cliente.chat.completions.create(
            model=modelo_de_prueba,
            messages=[{"role": "user", "content": "hola"}],
            max_tokens=1,
        )
        return True
    except Exception as e:
        plano = str(e).lower().replace("_", "").replace("-", "")
        return "freetier" not in plano and "insufficientquota" not in plano


async def modelos_disponibles_para_key(
    grupo_id: str, api_key: str
) -> tuple[set[str], set[str]] | None:
    """(confirmados, sin_verificar) para esta key real, o None si el listado
    en sí falló (key inválida, red, etc.).

    confirmados: esta key puede usarlos de verdad (probado, o inequívoco —
    los modelos free/local no dependen de facturación).
    sin_verificar: el listado los muestra pero no se puede confirmar su
    facturación con una llamada de prueba (hoy, solo pasa con Gemini "pago" —
    ver docstring del módulo). Ni disponibles ni bloqueados: se muestran
    aparte para no fingir una certeza que no existe.
    """
    cliente = AsyncOpenAI(
        api_key=api_key,
        base_url=_base_url_del_grupo(grupo_id),
        timeout=15.0,
        max_retries=0,
    )
    try:
        respuesta = await cliente.models.list()
    except Exception:
        return None

    # Gemini devuelve los ids con prefijo "models/" (confirmado con una
    # llamada real); OpenAI y NVIDIA NIM no lo llevan.
    ids_reales = {m.id.removeprefix("models/") for m in respuesta.data}
    por_listado = {
        clave
        for clave, modelo in _modelos_reales_del_grupo(grupo_id).items()
        if modelo in ids_reales
    }

    de_pago = {c for c in por_listado if CATALOGO[c]["categoria"] == "pago"}
    resto = por_listado - de_pago  # free/local del listado: sin ambigüedad

    if not de_pago:
        return resto, set()

    if grupo_id == "gemini":
        return resto, de_pago

    modelo_de_prueba = CATALOGO[next(iter(de_pago))]["model"]
    if await _tiene_facturacion(cliente, modelo_de_prueba):
        return resto | de_pago, set()
    return resto, set()  # confirmado SIN facturación: quedan bloqueados

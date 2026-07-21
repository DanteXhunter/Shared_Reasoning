"""Catálogo único de proveedores LLM.

Fuente de verdad de qué modelos existen, a qué endpoint apuntan y en qué
categoría caen. Antes esta tabla estaba duplicada en `extractor_agent.py` y
`planner_agent.py`, y el frontend mantenía su propia lista hardcodeada — por eso
`gemini-free` existía en el backend pero nunca aparecía en el selector.

Todos los proveedores hablan el protocolo /v1/chat/completions de OpenAI, así
que basta con cambiar `base_url` y `model` (CLAUDE.md §7).

Categorías:
- "pago"  → requiere créditos/billing en la cuenta del proveedor.
- "free"  → utilizable con la capa gratuita de su API.
- "local" → corre en la máquina del usuario, sin cuota ni costo.
"""

import os
import re
from dotenv import load_dotenv

load_dotenv()

# Ollama expone una API compatible con OpenAI en /v1. No valida la API key, pero
# el cliente de OpenAI exige que el campo no vaya vacío, de ahí el placeholder.
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llava")
OLLAMA_API_KEY_PLACEHOLDER = "ollama"

CATEGORIAS = {
    "pago": "De pago",
    "free": "Free",
    "local": "Locales",
}

# Grupo de credencial: una API key sirve para TODOS los modelos del mismo
# proveedor (la key de Gemini cubre gemini-flash-lite y gemini-3.5-flash por
# igual). El front pinta un campo por grupo, no uno por modelo ni por slot, y
# manda la key del grupo al que pertenece el modelo elegido. Los modelos
# locales no tienen grupo (no llevan key). Ver descripcion_publica().
GRUPOS_CREDENCIAL = {
    "OPENAI_API_KEY": {"id": "openai", "etiqueta": "OpenAI"},
    "GEMINI_API_KEY": {"id": "gemini", "etiqueta": "Google Gemini"},
    "NVIDIA_API_KEY": {"id": "nvidia", "etiqueta": "NVIDIA"},
}

# El orden de este dict es el orden en que el frontend pinta las opciones.
CATALOGO = {
    # Se usan los alias "-latest" en vez de versiones fijas (gemini-2.5-flash):
    # Google retira las versiones y la llamada empieza a dar 404 "no longer
    # available to new users". El alias lo reapunta Google al modelo vigente.
    "gemini-flash-lite-latest": {
        "model": "gemini-flash-lite-latest",
        "api_key_env": "GEMINI_API_KEY",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "categoria": "free",
        "etiqueta": "Gemini Flash Lite",
        "descripcion": "Rápido y liviano. Tiene capa gratuita si el proyecto no factura.",
        "por_defecto": False,
        "roles": ["vision", "razon"],
    },
    "nemotron": {
        "model": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
        "api_key_env": "NVIDIA_API_KEY",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "categoria": "free",
        "etiqueta": "Nemotron 3 Nano",
        "descripcion": "NVIDIA NIM. Alta latencia en el tier gratuito.",
        "por_defecto": False,
        "roles": ["razon"],
    },
    "llama-vision": {
        "model": "meta/llama-3.2-11b-vision-instruct",
        "api_key_env": "NVIDIA_API_KEY",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "categoria": "free",
        "etiqueta": "Llama 3.2 11B Vision",
        "descripcion": "NVIDIA NIM. Alta latencia en el tier gratuito.",
        "por_defecto": False,
        "roles": ["vision"],
    },
    "gpt-4o-mini": {
        "model": "gpt-4o-mini",
        "api_key_env": "OPENAI_API_KEY",
        "base_url": None,
        "categoria": "pago",
        "etiqueta": "GPT-4o mini",
        "descripcion": "Rápido y confiable. Se cobra por token consumido.",
        "por_defecto": False,
        "roles": ["vision", "razon"],
    },
    "o3-mini": {
        "model": "o3-mini",
        "api_key_env": "OPENAI_API_KEY",
        "base_url": None,
        "categoria": "pago",
        "etiqueta": "o3-mini",
        "descripcion": "Modelo de razonamiento de OpenAI. No ve imágenes — solo para razonar sobre texto/JSON.",
        "por_defecto": False,
        "roles": ["razon"],
    },
    "gemini-flash-latest": {
        "model": "gemini-flash-latest",
        "api_key_env": "GEMINI_API_KEY",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "categoria": "pago",
        "etiqueta": "Gemini Flash",
        "descripcion": "Mejor visión para leer esquemáticos. Requiere facturación activa.",
        "por_defecto": False,
        "roles": ["vision", "razon"],
    },
    "gemini-3.5-flash": {
        "model": "gemini-3.5-flash",
        "api_key_env": "GEMINI_API_KEY",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "categoria": "pago",
        "etiqueta": "Gemini 3.5 Flash",
        "descripcion": "Modelo de última generación. Excelente velocidad y optimizado para agentes complejos.",
        "por_defecto": True,
        "roles": ["vision", "razon"],
    },
    "gemini-3.1-pro": {
        "model": "gemini-3.1-pro-preview",
        "api_key_env": "GEMINI_API_KEY",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "categoria": "pago",
        "etiqueta": "Gemini 3.1 Pro",
        "descripcion": "Máxima precisión de razonamiento espacial y visión para leer esquemáticos.",
        "por_defecto": False,
        "roles": ["vision", "razon"],
    },
    "ollama": {
        "model": OLLAMA_MODEL,
        "api_key_env": None,
        "base_url": OLLAMA_BASE_URL,
        "categoria": "local",
        "etiqueta": f"Ollama ({OLLAMA_MODEL})",
        "descripcion": "Corre en tu máquina. Requiere Ollama activo con un modelo de visión.",
        "por_defecto": False,
        "roles": ["vision"],
    },
}

PROVEEDORES_VALIDOS = list(CATALOGO)

# Compatibilidad con el código que solo necesita model/api_key_env/base_url.
MODELOS_LANGGRAPH = {
    clave: {
        "model": cfg["model"],
        "api_key_env": cfg["api_key_env"],
        "base_url": cfg["base_url"],
    }
    for clave, cfg in CATALOGO.items()
}


def _config(proveedor: str) -> dict:
    config = CATALOGO.get(proveedor)
    if not config:
        raise ValueError(
            f"Proveedor '{proveedor}' no existe en el catálogo. "
            f"Disponibles: {PROVEEDORES_VALIDOS}"
        )
    return config


def api_key_de(proveedor: str) -> str | None:
    """API key del proveedor. Los locales usan un placeholder — no la validan."""
    config = _config(proveedor)
    if config["api_key_env"] is None:
        return OLLAMA_API_KEY_PLACEHOLDER
    return os.getenv(config["api_key_env"])


def esta_configurado(proveedor: str) -> bool:
    """Si hay API key. No garantiza que la cuenta tenga saldo — eso solo se
    descubre al hacer la petición."""
    config = _config(proveedor)
    if config["categoria"] == "local":
        return True
    return bool(os.getenv(config["api_key_env"]))


def resolver_api_key_usuario(proveedor: str, keys_por_grupo: dict[str, str]) -> str | None:
    """Key propia del usuario que corresponde a este modelo, o None si no dio
    ninguna para su proveedor real (en ese caso se cae a la key del servidor).

    `keys_por_grupo` viene del front con la forma {"openai": "...", "gemini":
    "...", "nvidia": "..."} — un campo por proveedor real, nunca por slot. Así
    es imposible mandar por accidente una key de Gemini a un endpoint de
    OpenAI: si el modelo elegido es de OpenAI pero el usuario solo dio key de
    Gemini, esto devuelve None (no la de Gemini) y el llamador cae al servidor.
    """
    grupo = grupo_credencial_de(proveedor)
    if grupo is None:
        return None
    return keys_por_grupo.get(grupo["id"]) or None


def proveedor_por_defecto() -> str:
    for clave, cfg in CATALOGO.items():
        if cfg["por_defecto"]:
            return clave
    return PROVEEDORES_VALIDOS[0]


def crear_modelo_langgraph(proveedor: str, api_key_override: str | None = None):
    """Modelo de LangChain para los grafos del extractor y del planner.

    `api_key_override`: si el usuario trajo su propia API key (ver §Config en
    CLAUDE.md), se usa esa en vez de la del servidor — nunca se persiste, solo
    viaja en la petición.
    """
    from langchain_openai import ChatOpenAI

    config = _config(proveedor)
    params = {
        "model": config["model"],
        "api_key": api_key_override or api_key_de(proveedor),
        "max_retries": 0,
    }
    if acepta_temperature(proveedor):
        params["temperature"] = 0
    if config["base_url"]:
        params["base_url"] = config["base_url"]

    return ChatOpenAI(**params)


def acepta_temperature(proveedor: str) -> bool:
    """Los modelos de razonamiento de OpenAI (o1/o3/o4) rechazan `temperature`
    explícito en la request — solo aceptan el valor por defecto de la API."""
    config = _config(proveedor)
    return not config["model"].startswith(("o1", "o3", "o4"))


def crear_provider_chat(proveedor: str, api_key_override: str | None = None):
    """MLLMProvider apuntando al endpoint del proveedor pedido, para que el
    chat use el mismo modelo que el usuario eligió al subir el esquemático.

    `api_key_override`: ver crear_modelo_langgraph.
    """
    from providers.mllm_provider import MLLMProvider

    config = _config(proveedor)
    return MLLMProvider(
        model=config["model"],
        base_url=config["base_url"],
        api_key=api_key_override or api_key_de(proveedor),
    )


# Modelo de RAZONAMIENTO del chat: las tareas estructuradas (clasificar la
# intención, extraer/aplicar modificaciones al netlist o a las posiciones)
# corren SIEMPRE con este modelo fijo, no con el que el usuario elige para
# conversar o para leer imágenes. Son tareas texto→JSON que exigen consistencia
# (CLAUDE.md §10, "clasificador a temperature=0 para consistencia"). El modelo
# elegido se reserva para lo que sí aprovecha su fortaleza: la visión del
# extractor y la respuesta conversacional que lee el usuario.
PROVEEDOR_RAZONAMIENTO = "gpt-4o-mini"


def crear_provider_razonamiento():
    """Provider fijo para las tareas estructuradas del chat (ver arriba)."""
    return crear_provider_chat(PROVEEDOR_RAZONAMIENTO)


_PATRON_API_KEY = re.compile(
    r"AIza[A-Za-z0-9_\-]{20,}"      # Google
    r"|sk-[A-Za-z0-9_\-]{20,}"      # OpenAI (incluye el formato sk-proj-...)
    r"|nvapi-[A-Za-z0-9_\-]{20,}"   # NVIDIA
)


def _ocultar_keys(texto: str) -> str:
    """Reemplaza cualquier substring con forma de API key por [REDACTED] antes
    de mandar el texto a un log. Algunos proveedores devuelven la key dentro
    del propio mensaje de error (ej. "API key AIza... no es válida")."""
    return _PATRON_API_KEY.sub("[REDACTED]", texto)


def es_error_freetier(e: Exception) -> bool:
    """Señal confirmada de que el proveedor rechazó la llamada por falta de
    facturación real (cuota de cortesía agotada) — ver
    providers/disponibilidad_usuario.py. Usada para marcar de forma
    permanente, tras un uso real, que la key propia de un usuario no tiene
    facturación (ver Usuario.sin_facturacion_confirmada en db/models.py)."""
    plano = str(e).lower().replace("_", "").replace("-", "")
    return "freetier" in plano


def mensaje_rate_limit(proveedor: str, modelo: str, e: Exception) -> tuple[str, str]:
    """Traduce un 429 del proveedor a una causa concreta.

    Un 429 no significa "se acabó tu tier gratuito". Google devuelve 429 también
    cuando la API key pertenece a un proyecto SIN facturación (los modelos de
    pago tienen cuota gratuita cero) y cuando se excede el límite por minuto de
    una cuenta que sí paga. El texto crudo del error distingue los casos, así que
    se conserva íntegro en el detalle.

    Devuelve (mensaje_para_el_usuario, detalle_crudo_de_la_api).
    """
    crudo = str(e)
    plano = crudo.lower().replace("_", "").replace("-", "")
    categoria = CATALOGO.get(proveedor, {}).get("categoria")

    # El cuerpo del 429 es un JSON largo; en la UI solo cabe la línea de cuota.
    # El error completo queda en el log del backend.
    print(f"[rate limit] {proveedor}/{modelo}: {_ocultar_keys(crudo)}")
    resumen = re.search(r"limit: (\d+), model: ([\w.\-]+)", crudo)
    detalle = (
        f"Cuota excedida: {resumen.group(1)} peticiones/día para '{resumen.group(2)}'."
        if resumen
        else crudo[:200]
    )

    if "freetier" in plano:
        mensaje = (
            f"Agotaste la cuota gratuita de '{modelo}'. La API key que usas pertenece a un proyecto "
            f"de Google sin facturación habilitada, así que Google le aplica los límites del free "
            f"tier aunque hayas pagado en otro proyecto. Habilita el billing en ESE proyecto, o "
            f"elige un modelo de la categoría Free."
        )
    elif categoria == "pago":
        mensaje = (
            f"'{modelo}' devolvió 429. Es un modelo de pago, así que casi siempre es el límite de "
            f"peticiones por minuto: espera unos segundos y reintenta. Si persiste, revisa que el "
            f"proyecto dueño de la API key tenga facturación activa y saldo."
        )
    else:
        mensaje = (
            f"Se agotó la cuota de '{modelo}'. Espera a que se reinicie el límite o elige otro modelo."
        )

    return mensaje, detalle


def grupo_credencial_de(proveedor: str) -> dict | None:
    """Grupo de credencial del proveedor (openai/gemini/nvidia), o None si es
    local (no lleva key)."""
    env = _config(proveedor)["api_key_env"]
    return GRUPOS_CREDENCIAL.get(env)


def grupos_credencial_publicos() -> list[dict]:
    """Grupos de credencial presentes en el catálogo, en orden de aparición —
    el front pinta un campo de API key por cada uno."""
    vistos: dict[str, dict] = {}
    for cfg in CATALOGO.values():
        grupo = GRUPOS_CREDENCIAL.get(cfg["api_key_env"])
        if grupo and grupo["id"] not in vistos:
            vistos[grupo["id"]] = grupo
    return list(vistos.values())


def descripcion_publica() -> list[dict]:
    """Catálogo tal como lo consume el frontend: agrupado por categoría."""
    from metricas import LIMITES

    grupos: dict[str, dict] = {
        clave: {"categoria": clave, "titulo": titulo, "modelos": []}
        for clave, titulo in CATEGORIAS.items()
    }

    for clave, cfg in CATALOGO.items():
        limites = LIMITES.get(clave, {})
        grupo_cred = GRUPOS_CREDENCIAL.get(cfg["api_key_env"])
        grupos[cfg["categoria"]]["modelos"].append({
            "id": clave,
            "modelo": cfg["model"],
            "etiqueta": cfg["etiqueta"],
            "descripcion": cfg["descripcion"],
            "categoria": cfg["categoria"],
            "por_defecto": cfg["por_defecto"],
            "roles": cfg["roles"],
            "disponible": esta_configurado(clave),
            "tipo_facturacion": limites.get("tipo", "desconocido"),
            "peticiones_dia": limites.get("peticiones_dia"),
            # A qué campo de API key propia pertenece este modelo (None = local).
            "grupo_credencial": grupo_cred["id"] if grupo_cred else None,
        })

    return list(grupos.values())

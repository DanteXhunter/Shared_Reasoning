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

# El orden de este dict es el orden en que el frontend pinta las opciones.
CATALOGO = {
    "gemini-free": {
        "model": "gemini-2.5-flash-lite",
        "api_key_env": "GEMINI_API_KEY",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "categoria": "free",
        "etiqueta": "Gemini 2.5 Flash Lite",
        "descripcion": "Rápido y liviano. El único Gemini usable sin créditos.",
        "por_defecto": True,
    },
    "nemotron": {
        "model": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
        "api_key_env": "NVIDIA_API_KEY",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "categoria": "free",
        "etiqueta": "Nemotron 3 Nano",
        "descripcion": "NVIDIA NIM. Alta latencia en el tier gratuito.",
        "por_defecto": False,
    },
    "llama-vision": {
        "model": "meta/llama-3.2-11b-vision-instruct",
        "api_key_env": "NVIDIA_API_KEY",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "categoria": "free",
        "etiqueta": "Llama 3.2 11B Vision",
        "descripcion": "NVIDIA NIM. Alta latencia en el tier gratuito.",
        "por_defecto": False,
    },
    "openai": {
        "model": "gpt-4o-mini",
        "api_key_env": "OPENAI_API_KEY",
        "base_url": None,
        "categoria": "pago",
        "etiqueta": "GPT-4o mini",
        "descripcion": "Rápido y confiable. Se cobra por token consumido.",
        "por_defecto": False,
    },
    "gemini": {
        "model": "gemini-2.5-flash",
        "api_key_env": "GEMINI_API_KEY",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "categoria": "pago",
        "etiqueta": "Gemini 2.5 Flash",
        "descripcion": "Mejor visión para leer esquemáticos. Requiere créditos prepago.",
        "por_defecto": False,
    },
    "ollama": {
        "model": OLLAMA_MODEL,
        "api_key_env": None,
        "base_url": OLLAMA_BASE_URL,
        "categoria": "local",
        "etiqueta": f"Ollama ({OLLAMA_MODEL})",
        "descripcion": "Corre en tu máquina. Requiere Ollama activo con un modelo de visión.",
        "por_defecto": False,
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


def proveedor_por_defecto() -> str:
    for clave, cfg in CATALOGO.items():
        if cfg["por_defecto"]:
            return clave
    return PROVEEDORES_VALIDOS[0]


def crear_modelo_langgraph(proveedor: str):
    """Modelo de LangChain para los grafos del extractor y del planner."""
    from langchain_openai import ChatOpenAI

    config = _config(proveedor)
    params = {
        "model": config["model"],
        "api_key": api_key_de(proveedor),
        "temperature": 0,
        "max_retries": 0,
    }
    if config["base_url"]:
        params["base_url"] = config["base_url"]

    return ChatOpenAI(**params)


def crear_provider_chat(proveedor: str):
    """OpenAIProvider apuntando al endpoint del proveedor pedido, para que el
    chat use el mismo modelo que el usuario eligió al subir el esquemático."""
    from providers.openai_provider import OpenAIProvider

    config = _config(proveedor)
    return OpenAIProvider(
        model=config["model"],
        base_url=config["base_url"],
        api_key=api_key_de(proveedor),
    )


def descripcion_publica() -> list[dict]:
    """Catálogo tal como lo consume el frontend: agrupado por categoría."""
    from metricas import LIMITES

    grupos: dict[str, dict] = {
        clave: {"categoria": clave, "titulo": titulo, "modelos": []}
        for clave, titulo in CATEGORIAS.items()
    }

    for clave, cfg in CATALOGO.items():
        limites = LIMITES.get(clave, {})
        grupos[cfg["categoria"]]["modelos"].append({
            "id": clave,
            "modelo": cfg["model"],
            "etiqueta": cfg["etiqueta"],
            "descripcion": cfg["descripcion"],
            "categoria": cfg["categoria"],
            "por_defecto": cfg["por_defecto"],
            "disponible": esta_configurado(clave),
            "tipo_facturacion": limites.get("tipo", "desconocido"),
            "peticiones_dia": limites.get("peticiones_dia"),
        })

    return list(grupos.values())

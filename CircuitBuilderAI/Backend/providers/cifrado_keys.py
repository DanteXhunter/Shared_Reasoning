"""Cifrado simétrico (Fernet) de las API keys propias que cada usuario guarda
en Mi cuenta → API keys propias (usuarios.api_keys_cifradas).

A diferencia de JWT_SECRET_KEY (que solo firma, no cifra), acá sí se cifra el
contenido: si se pierde API_KEYS_SECRET, las keys guardadas quedan
irrecuperables — no hay backdoor. Es la contrapartida de guardarlas en vez de
mandarlas por request en cada llamada (ver CLAUDE.md §Config API keys).
"""

import json
import os

from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv

load_dotenv()

API_KEYS_SECRET = os.getenv("API_KEYS_SECRET")


def _fernet() -> Fernet:
    if not API_KEYS_SECRET:
        raise RuntimeError("API_KEYS_SECRET no está configurada en el entorno (.env).")
    return Fernet(API_KEYS_SECRET.encode())


def cifrar_api_keys(keys: dict[str, str]) -> str:
    """Cifra el dict {proveedor: key} completo como un solo blob de texto."""
    payload = json.dumps(keys, ensure_ascii=False).encode()
    return _fernet().encrypt(payload).decode()


def descifrar_api_keys(blob: str | None) -> dict[str, str]:
    """Descifra el blob guardado en usuarios.api_keys_cifradas. Devuelve {} si
    no hay nada guardado o si el descifrado falla (ej. API_KEYS_SECRET
    cambió) — nunca lanza, para no romper /analizar, /planificar, etc. por un
    problema de configuración ajeno a la petición."""
    if not blob:
        return {}
    try:
        payload = _fernet().decrypt(blob.encode())
        return json.loads(payload)
    except (InvalidToken, ValueError, json.JSONDecodeError):
        return {}

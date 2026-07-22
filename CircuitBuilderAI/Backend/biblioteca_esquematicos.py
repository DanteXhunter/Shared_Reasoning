"""Biblioteca de esquemáticos de ejemplo, catalogados por dificultad
(facil/intermedio/dificil) — viven en un bucket público de Supabase Storage,
no en la base de datos (son archivos estáticos compartidos entre todos los
usuarios, no datos por cuenta).

Se listan en vivo contra la API de Storage en cada request, sin cachear: así
agregar o quitar una imagen del bucket la refleja sola en el front, sin tocar
código ni redesplegar. El volumen (una decena de imágenes) hace que el costo
de no cachear sea insignificante.
"""

import os
from urllib.parse import quote

import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
BUCKET = "biblioteca-esquematicos"
DIFICULTADES = ["facil", "intermedio", "dificil"]


def _nombre_legible(archivo: str) -> str:
    """'divisor-voltaje.png' -> 'Divisor voltaje'."""
    base = archivo.rsplit(".", 1)[0]
    limpio = base.replace("-", " ").replace("_", " ").strip()
    return f"{limpio[:1].upper()}{limpio[1:]}" if limpio else archivo


async def listar_biblioteca() -> dict[str, list[dict]]:
    """{dificultad: [{id, nombre, url}]}. Devuelve todo vacío (en vez de
    fallar) si Supabase Storage no está configurado o no responde — la
    biblioteca es un complemento opcional al drag-and-drop, no debe tumbar
    la pantalla de bienvenida si falla."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return {dificultad: [] for dificultad in DIFICULTADES}

    resultado: dict[str, list[dict]] = {}
    async with httpx.AsyncClient(timeout=10.0) as cliente:
        for dificultad in DIFICULTADES:
            try:
                r = await cliente.post(
                    f"{SUPABASE_URL}/storage/v1/object/list/{BUCKET}",
                    headers={
                        "apikey": SUPABASE_ANON_KEY,
                        "authorization": f"Bearer {SUPABASE_ANON_KEY}",
                    },
                    json={"prefix": dificultad, "limit": 100},
                )
                r.raise_for_status()
                # Filtra pseudo-carpetas (id None) y archivos que no sean imagen.
                archivos = [
                    item
                    for item in r.json()
                    if item.get("id")
                    and (item.get("metadata") or {}).get("mimetype", "").startswith("image/")
                ]
            except Exception:
                archivos = []

            resultado[dificultad] = [
                {
                    "id": f"{dificultad}/{item['name']}",
                    "nombre": _nombre_legible(item["name"]),
                    "url": f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{dificultad}/{quote(item['name'])}",
                }
                for item in archivos
            ]

    return resultado

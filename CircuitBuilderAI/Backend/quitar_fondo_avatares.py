"""Script de un solo uso: quita el fondo blanco de los 8 avatares del carrusel
de perfil (Frontend/public/avatares/avatar-1.png ... avatar-8.png).

No es parte del backend en ejecución — es una utilidad de preparación de
assets. Se corre una vez y se puede borrar después.

Usa flood-fill desde el borde de la imagen (no un reemplazo global de blanco):
solo el blanco CONECTADO al borde se vuelve transparente. Los ojos del blob
también son blancos pero están encerrados por el color del cuerpo, así que el
flood-fill nunca los alcanza y quedan intactos.

Uso:
    pip install Pillow
    python3 quitar_fondo_avatares.py
"""

from collections import deque
from pathlib import Path

from PIL import Image

# Ruta relativa a este archivo (Backend/) -> Frontend/public/avatares/
CARPETA_AVATARES = Path(__file__).parent.parent / "Frontend" / "public" / "avatares"
UMBRAL_BLANCO = 245  # un canal >= esto cuenta como "blanco" para el flood-fill


def quitar_fondo(ruta: Path) -> None:
    img = Image.open(ruta).convert("RGBA")
    ancho, alto = img.size
    pixeles = img.load()

    visitado = bytearray(ancho * alto)

    def es_blanco(x: int, y: int) -> bool:
        r, g, b, _a = pixeles[x, y]
        return r >= UMBRAL_BLANCO and g >= UMBRAL_BLANCO and b >= UMBRAL_BLANCO

    cola: deque[tuple[int, int]] = deque()
    for x in range(ancho):
        for y in (0, alto - 1):
            cola.append((x, y))
    for y in range(alto):
        for x in (0, ancho - 1):
            cola.append((x, y))

    while cola:
        x, y = cola.popleft()
        if x < 0 or x >= ancho or y < 0 or y >= alto:
            continue
        idx = y * ancho + x
        if visitado[idx]:
            continue
        if not es_blanco(x, y):
            continue
        visitado[idx] = 1
        r, g, b, _a = pixeles[x, y]
        pixeles[x, y] = (r, g, b, 0)
        cola.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

    img.save(ruta)
    print(f"OK  {ruta.name}")


def main() -> None:
    if not CARPETA_AVATARES.is_dir():
        raise SystemExit(f"No existe la carpeta: {CARPETA_AVATARES}")

    archivos = sorted(CARPETA_AVATARES.glob("avatar-*.png"))
    if not archivos:
        raise SystemExit(f"No hay archivos avatar-*.png en {CARPETA_AVATARES}")

    for ruta in archivos:
        quitar_fondo(ruta)


if __name__ == "__main__":
    main()

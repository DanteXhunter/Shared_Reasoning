from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from providers.gemini_provider import GeminiProvider
from providers.nvidia_provider import NvidiaProvider
from providers.openai_provider import OpenAIProvider
from metricas import Metricas, LIMITES
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="CircuitBuilder AI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROVEEDORES_VALIDOS = list(LIMITES.keys())
TIPOS_IMAGEN_VALIDOS = ["image/jpeg", "image/png", "image/webp", "image/tiff", "image/heic"]

metricas = Metricas()

def get_provider(proveedor: str):
    if proveedor not in PROVEEDORES_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Proveedor '{proveedor}' no válido. Valores válidos: {PROVEEDORES_VALIDOS}"
        )

    if proveedor in ["gemini", "gemini-free"]:
        return GeminiProvider(variante=proveedor)
    elif proveedor in ["nemotron", "llama-vision"]:
        return NvidiaProvider(variante=proveedor)
    elif proveedor == "openai":
        return OpenAIProvider(variante=proveedor)
    else:
        raise HTTPException(
            status_code=501,
            detail=f"Proveedor '{proveedor}' aún no tiene implementación."
        )

@app.get("/")
async def root():
    return {
        "mensaje": "CircuitBuilder AI backend corriendo",
        "version": "1.0.0",
        "metricas": {proveedor: metricas.resumen(proveedor) for proveedor in PROVEEDORES_VALIDOS}
    }

@app.post("/analizar")
async def analizar_esquematico(
    imagen: UploadFile = File(...),
    proveedor: str = Form(...)
):
    provider = get_provider(proveedor)

    if not metricas.puede_hacer_peticion(proveedor):
        raise HTTPException(
            status_code=429,
            detail="Se agotaron las peticiones diarias para este modelo. "
                   "Cambia de proveedor o espera hasta mañana."
        )

    if imagen.content_type not in TIPOS_IMAGEN_VALIDOS:
        raise HTTPException(
            status_code=415,
            detail=f"Tipo de archivo no soportado: '{imagen.content_type}'. "
                   f"Tipos válidos: {TIPOS_IMAGEN_VALIDOS}"
        )

    contenido = await imagen.read()

    if len(contenido) == 0:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    peso_maximo = metricas.peso_maximo_bytes(proveedor)
    if len(contenido) > peso_maximo:
        mb = peso_maximo // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"La imagen supera el límite de {mb}MB para '{proveedor}'."
        )

    resultado = await provider.analizar_esquematico(contenido, imagen.content_type)

    tokens_entrada = resultado.get("uso", {}).get("tokens_entrada", 0)
    tokens_salida = resultado.get("uso", {}).get("tokens_salida", 0)
    metricas.registrar(tokens_entrada, tokens_salida, proveedor)

    resultado["metricas"] = metricas.resumen(proveedor)

    return resultado
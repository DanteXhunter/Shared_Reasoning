from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from providers.gemini_provider import GeminiProvider
import os
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException

load_dotenv()

app = FastAPI(title="CircuitBuilder AI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_provider():
    proveedor = os.getenv("PROVIDER_ACTIVO", "gemini-free")
    
    if proveedor in ["gemini", "gemini-free"]:
        return GeminiProvider(variante=proveedor)
    else:
        raise ValueError(f"Proveedor '{proveedor}' no está implementado aún")

provider = get_provider()

@app.get("/")
async def root():
    return {"mensaje": "CircuitBuilder AI backend corriendo", "proveedor": os.getenv("PROVIDER_ACTIVO")}

@app.post("/analizar")
async def analizar_esquematico(imagen: UploadFile = File(...)):
    contenido = await imagen.read()
    resultado = await provider.analizar_esquematico(contenido, imagen.content_type)
    return resultado
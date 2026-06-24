from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from CircuitBuilderAI.Backend.providers.gemini_provider import GeminiProvider

app = FastAPI(title="CircuitBuilder AI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

provider = GeminiProvider()

@app.get("/")
async def root():
    return {"mensaje": "CircuitBuilder AI backend corriendo"}

@app.post("/analizar")
async def analizar_esquematico(imagen: UploadFile = File(...)):
    contenido = await imagen.read()
    resultado = await provider.analizar_esquematico(contenido, imagen.content_type)
    return resultado
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from agents.extractor_agent import ejecutar_extractor
from agents.planner_agent import ejecutar_planner
from agents.estado import ModoInteraccion
from metricas import Metricas, LIMITES
import json
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Paralelo", version="1.0.0")

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


@app.get("/")
async def root():
    return {
        "mensaje": "Paralelo backend corriendo",
        "version": "1.0.0",
        "metricas": {proveedor: metricas.resumen(proveedor) for proveedor in PROVEEDORES_VALIDOS}
    }


@app.post("/analizar")
async def analizar_esquematico(
    imagen: UploadFile = File(...),
    proveedor: str = Form(...)
):
    if proveedor not in PROVEEDORES_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Proveedor '{proveedor}' no válido. Valores válidos: {PROVEEDORES_VALIDOS}"
        )

    if not metricas.puede_hacer_peticion(proveedor):
        raise HTTPException(
            status_code=429,
            detail="Se agotaron las peticiones diarias para este modelo. Cambia de proveedor o espera hasta mañana."
        )

    if imagen.content_type not in TIPOS_IMAGEN_VALIDOS:
        raise HTTPException(
            status_code=415,
            detail=f"Tipo de archivo no soportado: '{imagen.content_type}'. Tipos válidos: {TIPOS_IMAGEN_VALIDOS}"
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

    resultado = await ejecutar_extractor(contenido, imagen.content_type, proveedor)

    if resultado.get("error"):
        raise HTTPException(
            status_code=422,
            detail={
                "mensaje": resultado["mensaje"],
                "errores": resultado["errores"],
                "uso": resultado["uso"],
            }
        )

    tokens_entrada = resultado.get("uso", {}).get("tokens_entrada", 0)
    tokens_salida = resultado.get("uso", {}).get("tokens_salida", 0)
    metricas.registrar(tokens_entrada, tokens_salida, proveedor)

    resultado["metricas"] = metricas.resumen(proveedor)

    return resultado


@app.post("/planificar")
async def planificar_circuito(
    proveedor: str = Form(...),
    modo: str = Form(...),
    netlist: str = Form(...)
):
    if proveedor not in PROVEEDORES_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Proveedor '{proveedor}' no válido. Valores válidos: {PROVEEDORES_VALIDOS}"
        )

    if modo not in [m.value for m in ModoInteraccion]:
        raise HTTPException(
            status_code=400,
            detail=f"Modo '{modo}' no válido. Valores válidos: {[m.value for m in ModoInteraccion]}"
        )

    try:
        netlist_dict = json.loads(netlist)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=400,
            detail="El campo 'netlist' no es un JSON válido."
        )

    if not metricas.puede_hacer_peticion(proveedor):
        raise HTTPException(
            status_code=429,
            detail="Se agotaron las peticiones diarias para este modelo. Cambia de proveedor o espera hasta mañana."
        )

    estado_extractor = {
        "imagen_base64": "",
        "mime_type": "",
        "proveedor": proveedor,
        "modo_interaccion": ModoInteraccion(modo),
        "historial_chat": [],
        "extractor_intento": 0,
        "extractor_errores": [],
        "extractor_respuesta_raw": None,
        "extractor_netlist": netlist_dict,
        "extractor_exito": True,
        "extractor_tokens_entrada": 0,
        "extractor_tokens_salida": 0,
        "extractor_tiempo": 0.0,
    }

    resultado = await ejecutar_planner(estado_extractor)

    if resultado.get("error"):
        raise HTTPException(
            status_code=422,
            detail={
                "mensaje": resultado["mensaje"],
                "errores": resultado["errores"],
                "uso": resultado["uso"],
            }
        )

    tokens_entrada = resultado.get("uso", {}).get("tokens_entrada", 0)
    tokens_salida = resultado.get("uso", {}).get("tokens_salida", 0)
    metricas.registrar(tokens_entrada, tokens_salida, proveedor)

    resultado["metricas"] = metricas.resumen(proveedor)

    return resultado
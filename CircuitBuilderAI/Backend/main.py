from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from agents.extractor_agent import ejecutar_extractor
from agents.planner_agent import ejecutar_planner
from agents.chat_agent_v2 import ejecutar_chat_agent_v2
from agents.verbosidad import redactar_plan, normalizar_nivel
from agents.estado import ModoInteraccion, MensajeChat
from db.database import get_db
from db.models import Usuario
from auth import (
    RegistroRequest,
    LoginRequest,
    TokenResponse,
    hashear_contrasena,
    verificar_contrasena,
    crear_token,
)
from metricas import Metricas, LIMITES
import json
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Paralelo", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    # En dev, Vite salta de puerto (5173, 5174, …) si el anterior está ocupado,
    # así que aceptamos cualquier puerto de localhost/127.0.0.1 en lugar de fijar uno.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROVEEDORES_VALIDOS = list(LIMITES.keys())
TIPOS_IMAGEN_VALIDOS = ["image/jpeg", "image/png", "image/webp", "image/tiff", "image/heic"]

metricas = Metricas()


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    campos = []
    for error in exc.errors():
        ubicacion = " → ".join(str(p) for p in error["loc"] if p != "body")
        campos.append(f"{ubicacion}: {error['msg']}")
    mensaje = "Faltan campos obligatorios o tienen formato incorrecto: " + "; ".join(campos)
    return JSONResponse(status_code=422, content={"detail": mensaje})


def _evento_sse(tipo: str, data: dict) -> str:
    payload = {"tipo": tipo, **data}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@app.get("/")
async def root():
    return {
        "mensaje": "Paralelo backend corriendo",
        "version": "1.0.0",
        "metricas": {proveedor: metricas.resumen(proveedor) for proveedor in PROVEEDORES_VALIDOS}
    }


@app.post("/auth/registro", response_model=TokenResponse, status_code=201)
def registro(datos: RegistroRequest, db: Session = Depends(get_db)):
    # Verificación previa por email (mensaje claro). La restricción UNIQUE de la
    # BD es la garantía final ante condiciones de carrera.
    if db.query(Usuario).filter(Usuario.email == datos.email).first():
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con este email.")

    usuario = Usuario(
        nombre=datos.nombre,
        email=datos.email,
        contrasena_hash=hashear_contrasena(datos.contrasena),
        nivel=datos.nivel,
    )
    db.add(usuario)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con este email.")
    db.refresh(usuario)

    token = crear_token(usuario.id)
    return TokenResponse(
        access_token=token,
        usuario_id=str(usuario.id),
        nombre=usuario.nombre,
        nivel=usuario.nivel,
    )


@app.post("/auth/login", response_model=TokenResponse)
def login(datos: LoginRequest, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.email == datos.email).first()
    # Mensaje genérico a propósito: no revela si el email existe (evita enumeración).
    if usuario is None or not verificar_contrasena(usuario.contrasena_hash, datos.contrasena):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas.")

    token = crear_token(usuario.id)
    return TokenResponse(
        access_token=token,
        usuario_id=str(usuario.id),
        nombre=usuario.nombre,
        nivel=usuario.nivel,
    )


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
    netlist: str = Form(...),
    nivel: str = Form(default="intermedio"),
    # 'modo' (tipo de interacción) se acepta por compatibilidad pero ya no rige
    # la geometría (la produce la capa determinística); la verbosidad usa 'nivel'.
    modo: str = Form(default="UNDER"),
):
    if proveedor not in PROVEEDORES_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Proveedor '{proveedor}' no válido. Valores válidos: {PROVEEDORES_VALIDOS}"
        )

    try:
        netlist_dict = json.loads(netlist)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="El campo 'netlist' no es un JSON válido.")

    estado_extractor = {
        "imagen_base64": "",
        "mime_type": "",
        "proveedor": proveedor,
        "modo_interaccion": ModoInteraccion(modo) if modo in [m.value for m in ModoInteraccion] else ModoInteraccion.UNDER,
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

    # 1) Geometría determinística (correcta por construcción, 0 tokens).
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

    # 2) Redacción por nivel (solo el texto; si falla, quedan las básicas).
    instrucciones, uso_redaccion = await redactar_plan(
        resultado["instrucciones"], normalizar_nivel(nivel), netlist_dict, proveedor
    )
    resultado["instrucciones"] = instrucciones
    resultado["uso_redaccion"] = uso_redaccion
    metricas.registrar(uso_redaccion.get("tokens_entrada", 0), uso_redaccion.get("tokens_salida", 0), "openai")

    resultado["metricas"] = metricas.resumen(proveedor)

    return resultado


@app.post("/procesar")
async def procesar_esquematico(
    imagen: UploadFile = File(...),
    proveedor: str = Form(...),
    nivel: str = Form(default="intermedio"),
    modo: str = Form(default="UNDER"),
):
    if proveedor not in PROVEEDORES_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Proveedor '{proveedor}' no válido. Valores válidos: {PROVEEDORES_VALIDOS}"
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

    if not metricas.puede_hacer_peticion(proveedor):
        raise HTTPException(
            status_code=429,
            detail="Se agotaron las peticiones diarias para este modelo. Cambia de proveedor o espera hasta mañana."
        )

    async def generador():
        yield _evento_sse("estado", {"mensaje": "Analizando esquemático..."})

        resultado_extractor = await ejecutar_extractor(contenido, imagen.content_type, proveedor)

        if resultado_extractor.get("error"):
            yield _evento_sse("error", {
                "etapa": "extractor",
                "mensaje": resultado_extractor["mensaje"],
                "errores": resultado_extractor["errores"],
            })
            return

        tokens_entrada_ext = resultado_extractor.get("uso", {}).get("tokens_entrada", 0)
        tokens_salida_ext = resultado_extractor.get("uso", {}).get("tokens_salida", 0)
        metricas.registrar(tokens_entrada_ext, tokens_salida_ext, proveedor)

        netlist = resultado_extractor["resultado"]
        num_componentes = len(netlist.get("componentes", []))
        num_conexiones = len(netlist.get("conexiones", []))

        yield _evento_sse("netlist_listo", {
            "mensaje": f"Circuito detectado: {num_componentes} componentes, {num_conexiones} conexiones",
            "netlist": netlist,
            "uso": resultado_extractor["uso"],
        })

        yield _evento_sse("estado", {"mensaje": "Generando instrucciones de armado..."})

        estado_extractor = {
            "imagen_base64": "",
            "mime_type": "",
            "proveedor": proveedor,
            "modo_interaccion": ModoInteraccion(modo),
            "historial_chat": [],
            "extractor_intento": resultado_extractor["uso"]["intentos"],
            "extractor_errores": [],
            "extractor_respuesta_raw": None,
            "extractor_netlist": netlist,
            "extractor_exito": True,
            "extractor_tokens_entrada": tokens_entrada_ext,
            "extractor_tokens_salida": tokens_salida_ext,
            "extractor_tiempo": resultado_extractor["uso"]["tiempo_segundos"],
        }

        resultado_planner = await ejecutar_planner(estado_extractor)

        if resultado_planner.get("error"):
            yield _evento_sse("error", {
                "etapa": "planner",
                "mensaje": resultado_planner["mensaje"],
                "errores": resultado_planner["errores"],
            })
            return

        tokens_entrada_plan = resultado_planner.get("uso", {}).get("tokens_entrada", 0)
        tokens_salida_plan = resultado_planner.get("uso", {}).get("tokens_salida", 0)
        metricas.registrar(tokens_entrada_plan, tokens_salida_plan, proveedor)

        yield _evento_sse("estado", {"mensaje": "Redactando las instrucciones para tu nivel..."})

        instrucciones, uso_redaccion = await redactar_plan(
            resultado_planner["instrucciones"], normalizar_nivel(nivel), netlist, proveedor
        )
        metricas.registrar(uso_redaccion.get("tokens_entrada", 0), uso_redaccion.get("tokens_salida", 0), "openai")

        yield _evento_sse("completo", {
            "mensaje": f"Listo, {len(instrucciones)} pasos generados",
            "instrucciones": instrucciones,
            "uso_extractor": resultado_extractor["uso"],
            "uso_planner": resultado_planner["uso"],
            "uso_redaccion": uso_redaccion,
            "metricas": metricas.resumen(proveedor),
        })

    return StreamingResponse(generador(), media_type="text/event-stream")


NIVEL_A_MODO = {
    "basico": ModoInteraccion.UNDER,
    "intermedio": ModoInteraccion.ALONG,
    "experto": ModoInteraccion.OVER,
}


@app.post("/chat")
async def chat(
    netlist: str = Form(...),
    historial: str = Form(...),
    proveedor: str = Form(default="openai"),
    nivel: str = Form(default="intermedio"),
    instrucciones: str = Form(default="[]"),
):
    if proveedor not in PROVEEDORES_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Proveedor '{proveedor}' no válido. Valores válidos: {PROVEEDORES_VALIDOS}"
        )

    if nivel not in NIVEL_A_MODO:
        raise HTTPException(
            status_code=400,
            detail=f"Nivel '{nivel}' no válido. Valores válidos: {list(NIVEL_A_MODO)}"
        )

    try:
        netlist_dict = json.loads(netlist)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="El campo 'netlist' no es un JSON válido.")

    try:
        historial_list: list[MensajeChat] = json.loads(historial)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="El campo 'historial' no es un JSON válido.")

    try:
        instrucciones_list = json.loads(instrucciones)
    except json.JSONDecodeError:
        instrucciones_list = []

    modo = NIVEL_A_MODO[nivel]

    estado = {
        "imagen_base64": "",
        "mime_type": "",
        "proveedor": proveedor,
        "modo_interaccion": modo,
        "nivel": normalizar_nivel(nivel),
        "historial_chat": historial_list,
        "extractor_intento": 0,
        "extractor_errores": [],
        "extractor_respuesta_raw": None,
        "extractor_netlist": netlist_dict,
        "extractor_exito": True,
        "extractor_tokens_entrada": 0,
        "extractor_tokens_salida": 0,
        "extractor_tiempo": 0.0,
        "planner_intento": 0,
        "planner_errores": [],
        "planner_respuesta_raw": None,
        "planner_instrucciones": instrucciones_list or None,
        "planner_exito": bool(instrucciones_list),
        "planner_tokens_entrada": 0,
        "planner_tokens_salida": 0,
        "planner_tiempo": 0.0,
        "planner_posiciones_override": None,
    }

    async def generador():
        yield _evento_sse("estado", {"mensaje": "Analizando tu mensaje..."})

        resultado = await ejecutar_chat_agent_v2(estado)

        if resultado.get("error"):
            yield _evento_sse("error", {
                "mensaje": resultado["mensaje"],
                "intencion_detectada": resultado.get("intencion_detectada"),
            })
            return

        intencion = resultado.get("intencion_detectada", "responder")

        if intencion == "responder":
            yield _evento_sse("respuesta", {
                "contenido": resultado.get("respuesta", ""),
                "intencion_detectada": intencion,
                "uso": resultado.get("uso", {}),
            })
        else:
            tokens_entrada = resultado.get("uso", {}).get("tokens_entrada", 0)
            tokens_salida = resultado.get("uso", {}).get("tokens_salida", 0)
            metricas.registrar(tokens_entrada, tokens_salida, proveedor)

            yield _evento_sse("actualizado", {
                "respuesta": resultado.get("respuesta", ""),
                "intencion_detectada": intencion,
                "instrucciones_actualizadas": resultado.get("instrucciones_actualizadas"),
                "netlist_modificado": resultado.get("netlist_modificado"),
                "posiciones_modificadas": resultado.get("posiciones_modificadas"),
                "uso": resultado.get("uso", {}),
            })

    return StreamingResponse(generador(), media_type="text/event-stream")

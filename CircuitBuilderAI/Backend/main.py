from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field
from agents.extractor_agent import ejecutar_extractor
from agents.planner_agent import ejecutar_planner
from agents.chat_agent_v2 import ejecutar_chat_agent_v2
from agents.verbosidad import normalizar_nivel
from agents.estado import ModoInteraccion, MensajeChat
from db.database import get_db
from db.models import Usuario, Sesion, ChatMensaje
from auth import (
    RegistroRequest,
    LoginRequest,
    TokenResponse,
    NivelRequest,
    NivelResponse,
    UsuarioResponse,
    PerfilRequest,
    ContrasenaRequest,
    hashear_contrasena,
    verificar_contrasena,
    crear_token,
    obtener_usuario_actual,
)
from metricas import Metricas, LIMITES
from providers.catalogo import (
    PROVEEDORES_VALIDOS,
    descripcion_publica,
    proveedor_por_defecto,
)
from rate_limit import (
    verificar_frecuencia,
    verificar_presupuesto_tokens,
    registrar_tokens_usuario,
    FRECUENCIA_AUTH,
)
from collections import Counter
from datetime import datetime
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


@app.get("/proveedores")
async def proveedores():
    """Catálogo de modelos agrupado por categoría, para el selector del front.

    Público a propósito: el usuario elige el modelo antes de autenticarse y no
    expone nada sensible (solo si hay API key configurada, nunca su valor).
    """
    return {
        "grupos": descripcion_publica(),
        "por_defecto": proveedor_por_defecto(),
    }


def _ip_de(request: Request) -> str:
    return request.client.host if request.client else "desconocida"


@app.post("/auth/registro", response_model=TokenResponse, status_code=201)
def registro(datos: RegistroRequest, request: Request, db: Session = Depends(get_db)):
    verificar_frecuencia(f"auth:{_ip_de(request)}", FRECUENCIA_AUTH)
    # Verificación previa por email (mensaje claro). La restricción UNIQUE de la
    # BD es la garantía final ante condiciones de carrera.
    if db.query(Usuario).filter(Usuario.email == datos.email).first():
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con este email.")

    usuario = Usuario(
        nombre=datos.nombre,
        email=datos.email,
        contrasena_hash=hashear_contrasena(datos.contrasena),
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
        email=usuario.email,
        nivel=usuario.nivel,
        nivel_confirmado=usuario.nivel_confirmado,
    )


@app.post("/auth/login", response_model=TokenResponse)
def login(datos: LoginRequest, request: Request, db: Session = Depends(get_db)):
    verificar_frecuencia(f"auth:{_ip_de(request)}", FRECUENCIA_AUTH)
    usuario = db.query(Usuario).filter(Usuario.email == datos.email).first()
    # Mensaje genérico a propósito: no revela si el email existe (evita enumeración).
    if usuario is None or not verificar_contrasena(usuario.contrasena_hash, datos.contrasena):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas.")

    token = crear_token(usuario.id)
    return TokenResponse(
        access_token=token,
        usuario_id=str(usuario.id),
        nombre=usuario.nombre,
        email=usuario.email,
        nivel=usuario.nivel,
        nivel_confirmado=usuario.nivel_confirmado,
    )


@app.get("/auth/me", response_model=UsuarioResponse)
def usuario_actual(usuario: Usuario = Depends(obtener_usuario_actual)):
    return UsuarioResponse(
        usuario_id=str(usuario.id),
        nombre=usuario.nombre,
        email=usuario.email,
        nivel=usuario.nivel,
        nivel_confirmado=usuario.nivel_confirmado,
    )


@app.patch("/auth/perfil", response_model=UsuarioResponse)
def actualizar_perfil(
    datos: PerfilRequest,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    if datos.nombre is not None:
        usuario.nombre = datos.nombre

    if datos.email is not None and datos.email != usuario.email:
        # Verificación previa por claridad; la restricción UNIQUE es la garantía final.
        if db.query(Usuario).filter(Usuario.email == datos.email, Usuario.id != usuario.id).first():
            raise HTTPException(status_code=409, detail="Ya existe una cuenta con este email.")
        usuario.email = datos.email

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con este email.")
    db.refresh(usuario)

    return UsuarioResponse(
        usuario_id=str(usuario.id),
        nombre=usuario.nombre,
        email=usuario.email,
        nivel=usuario.nivel,
        nivel_confirmado=usuario.nivel_confirmado,
    )


@app.patch("/auth/contrasena", status_code=204)
def cambiar_contrasena(
    datos: ContrasenaRequest,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    if not verificar_contrasena(usuario.contrasena_hash, datos.contrasena_actual):
        raise HTTPException(status_code=400, detail="La contraseña actual es incorrecta.")
    usuario.contrasena_hash = hashear_contrasena(datos.contrasena_nueva)
    db.commit()


@app.patch("/auth/nivel", response_model=NivelResponse)
def actualizar_nivel(
    datos: NivelRequest,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    usuario.nivel = datos.nivel
    usuario.nivel_confirmado = True
    db.commit()
    db.refresh(usuario)

    return NivelResponse(nivel=usuario.nivel, nivel_confirmado=usuario.nivel_confirmado)


# ============================================================
#  Sesiones (#73) — persistencia del estado del circuito por usuario.
#  Los esquemas viven aquí (no en un módulo aparte) porque, a diferencia de
#  auth, no tienen lógica reutilizable: solo describen la forma del request/
#  response de estos endpoints.
# ============================================================

class SesionCrear(BaseModel):
    nombre: str = Field(min_length=1, max_length=200)
    netlist: dict
    instrucciones: list
    modo: str | None = None
    metricas: dict | None = None


class SesionCreada(BaseModel):
    sesion_id: str


class SesionResumen(BaseModel):
    id: str
    nombre: str
    fecha: datetime | None
    modo_detectado: str | None


class SesionCompleta(BaseModel):
    id: str
    nombre: str
    netlist: dict | None
    instrucciones: list | None
    modo_detectado: str | None
    metricas: dict | None
    fecha: datetime | None
    historial: list[dict]


@app.post("/sesiones", response_model=SesionCreada, status_code=201)
def crear_sesion(
    datos: SesionCrear,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    sesion = Sesion(
        usuario_id=usuario.id,
        nombre=datos.nombre,
        netlist=datos.netlist,
        instrucciones=datos.instrucciones,
        modo_detectado=datos.modo,
        metricas=datos.metricas,
    )
    db.add(sesion)
    db.commit()
    db.refresh(sesion)
    return SesionCreada(sesion_id=str(sesion.id))


@app.get("/sesiones", response_model=list[SesionResumen])
def listar_sesiones(
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    sesiones = (
        db.query(Sesion)
        .filter(Sesion.usuario_id == usuario.id)
        .order_by(Sesion.fecha.desc())
        .all()
    )
    return [
        SesionResumen(
            id=str(s.id),
            nombre=s.nombre,
            fecha=s.fecha,
            modo_detectado=s.modo_detectado,
        )
        for s in sesiones
    ]


@app.get("/sesiones/{sesion_id}", response_model=SesionCompleta)
def obtener_sesion(
    sesion_id: str,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    sesion = _buscar_sesion_del_usuario(db, sesion_id, usuario.id)
    if sesion is None:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")

    mensajes = (
        db.query(ChatMensaje)
        .filter(ChatMensaje.sesion_id == sesion.id)
        .order_by(ChatMensaje.timestamp.asc())
        .all()
    )
    historial = [{"rol": m.rol, "contenido": m.contenido} for m in mensajes]

    return SesionCompleta(
        id=str(sesion.id),
        nombre=sesion.nombre,
        netlist=sesion.netlist,
        instrucciones=sesion.instrucciones,
        modo_detectado=sesion.modo_detectado,
        metricas=sesion.metricas,
        fecha=sesion.fecha,
        historial=historial,
    )


def _buscar_sesion_del_usuario(db: Session, sesion_id: str, usuario_id):
    """Devuelve la sesión solo si pertenece al usuario; None en cualquier otro
    caso (id inválido, inexistente o de otro usuario). No distingue entre ellos
    para no filtrar qué sesiones existen."""
    try:
        return (
            db.query(Sesion)
            .filter(Sesion.id == sesion_id, Sesion.usuario_id == usuario_id)
            .first()
        )
    except Exception:
        # sesion_id con formato inválido para UUID → tratado como "no encontrada".
        db.rollback()
        return None


@app.post("/analizar")
async def analizar_esquematico(
    imagen: UploadFile = File(...),
    proveedor: str = Form(...),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    if proveedor not in PROVEEDORES_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Proveedor '{proveedor}' no válido. Valores válidos: {PROVEEDORES_VALIDOS}"
        )

    verificar_frecuencia(f"user:{usuario.id}")
    verificar_presupuesto_tokens(usuario, proveedor)

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
    registrar_tokens_usuario(usuario, proveedor, tokens_entrada + tokens_salida)

    resultado["metricas"] = metricas.resumen(proveedor)

    return resultado


@app.post("/planificar")
async def planificar_circuito(
    proveedor: str = Form(...),
    # Modelo de razonamiento (planner). Vacío → usa el mismo que `proveedor`
    # (retrocompatible con clientes que aún no mandan este campo).
    proveedor_razon: str = Form(default=""),
    netlist: str = Form(...),
    nivel: str = Form(default="intermedio"),
    # 'modo' (tipo de interacción) se acepta por compatibilidad pero ya no rige
    # la geometría (la produce la capa determinística); la verbosidad usa 'nivel'.
    modo: str = Form(default="UNDER"),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    if proveedor not in PROVEEDORES_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Proveedor '{proveedor}' no válido. Valores válidos: {PROVEEDORES_VALIDOS}"
        )

    proveedor_razon = proveedor_razon or proveedor
    if proveedor_razon not in PROVEEDORES_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Proveedor de razonamiento '{proveedor_razon}' no válido. Valores válidos: {PROVEEDORES_VALIDOS}"
        )

    try:
        netlist_dict = json.loads(netlist)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="El campo 'netlist' no es un JSON válido.")

    verificar_frecuencia(f"user:{usuario.id}")
    verificar_presupuesto_tokens(usuario, proveedor)

    if not metricas.puede_hacer_peticion(proveedor):
        raise HTTPException(
            status_code=429,
            detail="Se agotaron las peticiones diarias para este modelo. Cambia de proveedor o espera hasta mañana."
        )

    estado_extractor = {
        "imagen_base64": "",
        "mime_type": "",
        "proveedor": proveedor,
        "proveedor_razon": proveedor_razon,
        "modo_interaccion": ModoInteraccion(modo) if modo in [m.value for m in ModoInteraccion] else ModoInteraccion.UNDER,
        "nivel": normalizar_nivel(nivel),
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

    # La IA propone el armado YA redactado con la verbosidad del nivel
    # (agents/planner_agent.py) — sin una segunda llamada de redacción aparte.
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

    # El planner es una tarea de RAZONAMIENTO (no ve la imagen) — los tokens que
    # consumió corresponden al modelo de razón, no al de visión. Antes esto se
    # atribuía siempre a `proveedor`, así que con slots distintos el consumo de
    # o3-mini (por ejemplo) se contaba como si fuera de Gemini.
    tokens_entrada = resultado.get("uso", {}).get("tokens_entrada", 0)
    tokens_salida = resultado.get("uso", {}).get("tokens_salida", 0)
    metricas.registrar(tokens_entrada, tokens_salida, proveedor_razon)
    registrar_tokens_usuario(usuario, proveedor_razon, tokens_entrada + tokens_salida)

    # Las instrucciones ya vienen redactadas según el nivel desde el planner
    # (una sola llamada LLM que usa reglas_nivel); no hay una segunda pasada de
    # redacción — por eso el planner corre con el proveedor elegido y no se
    # fuerza OpenAI a mitad del pipeline.
    resultado["metricas"] = metricas.resumen(proveedor_razon)

    return resultado


@app.post("/procesar")
async def procesar_esquematico(
    imagen: UploadFile = File(...),
    proveedor: str = Form(...),
    proveedor_razon: str = Form(default=""),
    nivel: str = Form(default="intermedio"),
    modo: str = Form(default="UNDER"),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    if proveedor not in PROVEEDORES_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Proveedor '{proveedor}' no válido. Valores válidos: {PROVEEDORES_VALIDOS}"
        )

    proveedor_razon = proveedor_razon or proveedor
    if proveedor_razon not in PROVEEDORES_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Proveedor de razonamiento '{proveedor_razon}' no válido. Valores válidos: {PROVEEDORES_VALIDOS}"
        )

    # Diego quitó esta validación en dev al refactorizar (modo ahora tiene
    # default seguro), pero más abajo sigue usando ModoInteraccion(modo) sin
    # resguardo — un valor inválido tronaría con 500. La conservo para que siga
    # siendo un 400 claro.
    if modo not in [m.value for m in ModoInteraccion]:
        raise HTTPException(
            status_code=400,
            detail=f"Modo '{modo}' no válido. Valores válidos: {[m.value for m in ModoInteraccion]}"
        )

    verificar_frecuencia(f"user:{usuario.id}")
    verificar_presupuesto_tokens(usuario, proveedor)

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
        registrar_tokens_usuario(usuario, proveedor, tokens_entrada_ext + tokens_salida_ext)

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
            "proveedor_razon": proveedor_razon,
            "modo_interaccion": ModoInteraccion(modo),
            "nivel": normalizar_nivel(nivel),
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

        # La IA propone el armado ya redactado con la verbosidad del nivel —
        # sin una segunda llamada de redacción aparte.
        resultado_planner = await ejecutar_planner(estado_extractor)

        if resultado_planner.get("error"):
            yield _evento_sse("error", {
                "etapa": "planner",
                "mensaje": resultado_planner["mensaje"],
                "errores": resultado_planner["errores"],
            })
            return

        # El planner es razonamiento, no visión — se atribuye a proveedor_razon
        # (ver /planificar más arriba para el mismo criterio).
        tokens_entrada_plan = resultado_planner.get("uso", {}).get("tokens_entrada", 0)
        tokens_salida_plan = resultado_planner.get("uso", {}).get("tokens_salida", 0)
        metricas.registrar(tokens_entrada_plan, tokens_salida_plan, proveedor_razon)
        registrar_tokens_usuario(usuario, proveedor_razon, tokens_entrada_plan + tokens_salida_plan)

        # Las instrucciones ya vienen redactadas según el nivel desde el planner
        # (una sola llamada LLM que usa reglas_nivel); no hay una segunda pasada.
        instrucciones = resultado_planner["instrucciones"]

        yield _evento_sse("completo", {
            "mensaje": f"Listo, {len(instrucciones)} pasos generados",
            "instrucciones": instrucciones,
            "uso_extractor": resultado_extractor["uso"],
            "uso_planner": resultado_planner["uso"],
            # Este endpoint corre AMBOS roles (extractor=visión, planner=razón),
            # así que se reportan por separado en vez de un solo "metricas".
            "metricas_vision": metricas.resumen(proveedor),
            "metricas_razon": metricas.resumen(proveedor_razon),
        })

    return StreamingResponse(generador(), media_type="text/event-stream")


NIVEL_A_MODO = {
    "basico": ModoInteraccion.UNDER,
    "intermedio": ModoInteraccion.ALONG,
    "experto": ModoInteraccion.OVER,
}


def _persistir_interaccion_chat(db, sesion, historial_list, resultado, modo, intencion):
    """Guarda el nuevo par de mensajes (usuario + asistente) como filas
    ChatMensaje —fuente de verdad del historial—, refleja en la sesión los
    cambios de circuito que hizo el chat, acumula métricas y recalcula el modo
    predominante."""
    modo_valor = modo.value

    # El nuevo mensaje del usuario es el último del historial que envía el
    # frontend (lo agrega justo antes de mandar la petición).
    if historial_list and historial_list[-1].get("rol") == "user":
        db.add(ChatMensaje(
            sesion_id=sesion.id,
            rol="user",
            contenido=historial_list[-1].get("contenido", ""),
            modo_detectado=modo_valor,
        ))

    respuesta = resultado.get("respuesta", "")
    if respuesta:
        db.add(ChatMensaje(
            sesion_id=sesion.id,
            rol="assistant",
            contenido=respuesta,
            modo_detectado=modo_valor,
        ))

    # Si el chat modificó el circuito, la sesión guarda el estado nuevo.
    if intencion != "responder":
        if resultado.get("netlist_modificado"):
            sesion.netlist = resultado["netlist_modificado"]
        if resultado.get("instrucciones_actualizadas"):
            sesion.instrucciones = resultado["instrucciones_actualizadas"]

    # Métricas acumuladas. Se reasigna el dict completo para que SQLAlchemy
    # detecte el cambio en la columna JSONB.
    uso = resultado.get("uso", {})
    m = dict(sesion.metricas or {})
    m["tokens_entrada"] = m.get("tokens_entrada", 0) + uso.get("tokens_entrada", 0)
    m["tokens_salida"] = m.get("tokens_salida", 0) + uso.get("tokens_salida", 0)
    m["tokens_total"] = m["tokens_entrada"] + m["tokens_salida"]
    m["llamadas_llm"] = m.get("llamadas_llm", 0) + 1
    sesion.metricas = m

    db.commit()

    # Modo predominante = el más frecuente entre los mensajes de la sesión.
    # (La detección real del modo por mensaje llega en el #82; por ahora se usa
    # el modo derivado del nivel.)
    filas = (
        db.query(ChatMensaje.modo_detectado)
        .filter(ChatMensaje.sesion_id == sesion.id)
        .all()
    )
    modos = [f[0] for f in filas if f[0]]
    if modos:
        sesion.modo_detectado = Counter(modos).most_common(1)[0][0]
        db.commit()


@app.post("/chat")
async def chat(
    netlist: str = Form(...),
    historial: str = Form(...),
    proveedor: str = Form(default="openai"),
    proveedor_razon: str = Form(default=""),
    nivel: str = Form(default="intermedio"),
    instrucciones: str = Form(default="[]"),
    sesion_id: str | None = Form(default=None),
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    if proveedor not in PROVEEDORES_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Proveedor '{proveedor}' no válido. Valores válidos: {PROVEEDORES_VALIDOS}"
        )

    proveedor_razon = proveedor_razon or proveedor
    if proveedor_razon not in PROVEEDORES_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Proveedor de razonamiento '{proveedor_razon}' no válido. Valores válidos: {PROVEEDORES_VALIDOS}"
        )

    verificar_frecuencia(f"user:{usuario.id}")
    verificar_presupuesto_tokens(usuario, proveedor)

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

    # Si viene sesion_id, debe pertenecer al usuario. Si no, se responde sin
    # persistir (la persistencia es opt-in vía sesion_id).
    sesion = None
    if sesion_id:
        sesion = _buscar_sesion_del_usuario(db, sesion_id, usuario.id)
        if sesion is None:
            raise HTTPException(status_code=404, detail="Sesión no encontrada.")

    modo = NIVEL_A_MODO[nivel]

    estado = {
        "imagen_base64": "",
        "mime_type": "",
        "proveedor": proveedor,
        "proveedor_razon": proveedor_razon,
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

        # Todo el trabajo de /chat (clasificar, modificar, responder) es
        # razonamiento sobre texto — no hay imagen en esta ruta — así que se
        # atribuye a proveedor_razon, no a proveedor (visión).
        #
        # El chat consume tokens en cualquier intención, así que se acumulan al
        # presupuesto del usuario aquí (no solo en la rama de modificación).
        uso_chat = resultado.get("uso", {})
        registrar_tokens_usuario(
            usuario, proveedor_razon,
            uso_chat.get("tokens_entrada", 0) + uso_chat.get("tokens_salida", 0),
        )

        if intencion == "responder":
            yield _evento_sse("respuesta", {
                "contenido": resultado.get("respuesta", ""),
                "intencion_detectada": intencion,
                "uso": resultado.get("uso", {}),
            })
        else:
            tokens_entrada = resultado.get("uso", {}).get("tokens_entrada", 0)
            tokens_salida = resultado.get("uso", {}).get("tokens_salida", 0)
            metricas.registrar(tokens_entrada, tokens_salida, proveedor_razon)

            yield _evento_sse("actualizado", {
                "respuesta": resultado.get("respuesta", ""),
                "intencion_detectada": intencion,
                "instrucciones_actualizadas": resultado.get("instrucciones_actualizadas"),
                "netlist_modificado": resultado.get("netlist_modificado"),
                "posiciones_modificadas": resultado.get("posiciones_modificadas"),
                "uso": resultado.get("uso", {}),
            })

        # Persistencia (#73): solo si la petición trae una sesión válida. Un
        # fallo al guardar no debe romper la respuesta ya enviada al usuario.
        if sesion is not None:
            try:
                _persistir_interaccion_chat(db, sesion, historial_list, resultado, modo, intencion)
            except Exception:
                db.rollback()

    return StreamingResponse(generador(), media_type="text/event-stream")

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
from agents.estado import MensajeChat
from agents.deteccion_interaccion import diagnosticar_interaccion_inicial
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
    ApiKeysRequest,
    ApiKeysConfiguradas,
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
    grupos_credencial_publicos,
    crear_provider_chat,
    resolver_api_key_usuario,
)
from providers.cifrado_keys import cifrar_api_keys, descifrar_api_keys
from providers.disponibilidad_usuario import modelos_disponibles_para_key
from biblioteca_esquematicos import listar_biblioteca
from rate_limit import (
    verificar_frecuencia,
    FRECUENCIA_AUTH,
)
from collections import Counter
from datetime import datetime
import asyncio
import json
import os
import secrets
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Paralelo", version="1.0.0")

# Dominio del frontend en producción (Cloudflare Pages) — issue #78. Se lee de
# env en vez de hardcodearlo para poder cambiar el dominio sin tocar código.
FRONTEND_URL = os.getenv("FRONTEND_URL")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL] if FRONTEND_URL else [],
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
        # Campos de API key propia que el front debe ofrecer (uno por proveedor).
        "grupos_credencial": grupos_credencial_publicos(),
    }


@app.get("/biblioteca-esquematicos")
async def biblioteca_esquematicos():
    """Esquemáticos de ejemplo por dificultad (Supabase Storage), para elegir
    uno en vez de subir el propio (ver Bienvenida.tsx). Público por la misma
    razón que /proveedores: no expone nada sensible."""
    return await listar_biblioteca()


def _ip_de(request: Request) -> str:
    return request.client.host if request.client else "desconocida"


def _marcar_sin_facturacion(db: Session, usuario: Usuario, grupo_id: str | None) -> None:
    """Persiste que la key propia del usuario para este grupo no tiene
    facturación real — confirmado por un 429 "FreeTier" real durante un uso
    de verdad (extractor/planner), no por una prueba sintética (ver
    providers/disponibilidad_usuario.py). Alimenta GET /auth/modelos-disponibles
    para bloquear ese grupo de ahí en adelante, en vez de dejarlo "sin
    verificar" para siempre."""
    if not grupo_id:
        return
    actuales = dict(usuario.sin_facturacion_confirmada or {})
    if actuales.get(grupo_id):
        return
    actuales[grupo_id] = True
    usuario.sin_facturacion_confirmada = actuales
    db.commit()


def _api_keys_configuradas(usuario: Usuario) -> ApiKeysConfiguradas:
    """Flags de "¿el usuario tiene una key propia guardada?" por proveedor —
    nunca el valor. Es lo único que ve el front para mostrar "configurada ✓"."""
    keys = descifrar_api_keys(usuario.api_keys_cifradas)
    return ApiKeysConfiguradas(
        openai=bool(keys.get("openai")),
        gemini=bool(keys.get("gemini")),
        nvidia=bool(keys.get("nvidia")),
    )


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
        foto_perfil=usuario.foto_perfil,
        api_keys_configuradas=_api_keys_configuradas(usuario),
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
        foto_perfil=usuario.foto_perfil,
        api_keys_configuradas=_api_keys_configuradas(usuario),
    )


@app.get("/auth/me", response_model=UsuarioResponse)
def usuario_actual(usuario: Usuario = Depends(obtener_usuario_actual)):
    return UsuarioResponse(
        usuario_id=str(usuario.id),
        nombre=usuario.nombre,
        email=usuario.email,
        nivel=usuario.nivel,
        nivel_confirmado=usuario.nivel_confirmado,
        foto_perfil=usuario.foto_perfil,
        api_keys_configuradas=_api_keys_configuradas(usuario),
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

    if datos.foto_perfil is not None:
        # Cadena vacía = "quitar foto" (vuelve a mostrarse la inicial del
        # nombre); cualquier otro valor no vacío es el preset o data URL nuevo.
        usuario.foto_perfil = datos.foto_perfil or None

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
        foto_perfil=usuario.foto_perfil,
        api_keys_configuradas=_api_keys_configuradas(usuario),
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


@app.patch("/auth/api-keys", response_model=UsuarioResponse)
def actualizar_api_keys(
    datos: ApiKeysRequest,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Guarda las API keys propias del usuario, cifradas (ver
    providers/cifrado_keys.py). Nunca se devuelve el valor de vuelta — la
    respuesta solo trae los flags de api_keys_configuradas."""
    actuales = descifrar_api_keys(usuario.api_keys_cifradas)

    for grupo_id, valor in datos.model_dump().items():
        if valor is None:
            continue  # no vino en la petición: no tocar esa key
        if valor == "":
            actuales.pop(grupo_id, None)  # "" = borrar esa key
        else:
            actuales[grupo_id] = valor

    usuario.api_keys_cifradas = cifrar_api_keys(actuales) if actuales else None
    db.commit()
    db.refresh(usuario)

    return UsuarioResponse(
        usuario_id=str(usuario.id),
        nombre=usuario.nombre,
        email=usuario.email,
        nivel=usuario.nivel,
        nivel_confirmado=usuario.nivel_confirmado,
        foto_perfil=usuario.foto_perfil,
        api_keys_configuradas=_api_keys_configuradas(usuario),
    )


@app.get("/auth/modelos-disponibles")
async def modelos_disponibles_usuario(usuario: Usuario = Depends(obtener_usuario_actual)):
    """Para cada API key propia que el usuario tenga guardada, confirma en
    vivo qué modelos del catálogo puede usar esa key (base del candado en
    SelectorModelo). Los proveedores sin key propia configurada simplemente
    no aparecen en la respuesta — el front cae al flag del servidor para esos."""
    keys = descifrar_api_keys(usuario.api_keys_cifradas)
    grupos_con_key = [g["id"] for g in grupos_credencial_publicos() if keys.get(g["id"])]

    resultados = await asyncio.gather(
        *(modelos_disponibles_para_key(grupo_id, keys[grupo_id]) for grupo_id in grupos_con_key),
        return_exceptions=True,
    )

    # Grupos con un 429 "FreeTier" REAL ya confirmado (ver _marcar_sin_facturacion
    # y Usuario.sin_facturacion_confirmada) — ahí "sin verificar" pasa a
    # bloqueado de verdad, ya no hace falta seguir dudando.
    sin_facturacion = usuario.sin_facturacion_confirmada or {}

    # return_exceptions=True: si UN proveedor falla por algo inesperado, no se
    # cae la respuesta entera (eso dejaría a los demás grupos también "sin
    # candado" en el front, que ante cualquier error de esta llamada cae a
    # mostrar todo disponible).
    respuesta: dict[str, dict[str, list[str]]] = {}
    for grupo_id, resultado in zip(grupos_con_key, resultados):
        if not isinstance(resultado, tuple):
            continue
        confirmados, sin_verificar = resultado
        if sin_facturacion.get(grupo_id):
            sin_verificar = set()  # confirmado por uso real: quedan bloqueados, no "sin verificar"
        respuesta[grupo_id] = {
            "confirmados": sorted(confirmados),
            "sin_verificar": sorted(sin_verificar),
        }
    return respuesta


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
    # Data URL (base64) del esquemático, ya comprimida en el navegador
    # (~1200px de lado máximo) antes de mandarla — el límite generoso cubre
    # esquemáticos con detalle sin dejar pasar algo sin comprimir.
    imagen_esquema: str | None = Field(default=None, max_length=4_000_000)


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
    imagen_esquema: str | None


class SesionRenombrar(BaseModel):
    nombre: str = Field(min_length=1, max_length=200)


# Temporizador inicio/fin: el frontend mide todo localmente (Date.now()) y
# manda el resultado completo de una sola vez al terminar — evita ir
# sincronizando paso a paso mientras el usuario arma el circuito.
class SesionFinalizar(BaseModel):
    tiempo_total_segundos: float
    # {"1": 12.3, "2": 45.0, ...} — claves string porque así viaja en JSON.
    tiempo_por_paso: dict[str, float]
    inicio: datetime | None = None
    fin: datetime | None = None


class ResultadoBusqueda(BaseModel):
    id: str
    nombre: str
    fecha: datetime | None
    # Pedacito del mensaje donde apareció la búsqueda (estilo WhatsApp).
    # None si la coincidencia fue solo en el nombre de la conversación.
    fragmento: str | None = None


# ---- Compartir sesión por link ----
# Modelo elegido: COPIA independiente, no edición colaborativa en vivo. Quien
# recibe el link se trae un snapshot (netlist + instrucciones + historial) a
# su propia cuenta; desde ahí cada quien sigue su propio camino sin pisarse.

class SesionCompartirResponse(BaseModel):
    token: str


class SesionCompartidaPreview(BaseModel):
    nombre: str
    fecha: datetime | None
    cantidad_mensajes: int


class SesionImportada(BaseModel):
    sesion_id: str


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
        imagen_esquema=datos.imagen_esquema,
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


def _fragmento(contenido: str, consulta: str, alrededor: int = 40) -> str:
    """Recorta `contenido` a un pedacito centrado en la primera aparición de
    `consulta` (estilo WhatsApp). Si no la encuentra (no debería pasar, ya que
    solo se llama sobre mensajes que sí matchearon), corta el inicio."""
    idx = contenido.lower().find(consulta.lower())
    if idx == -1:
        recorte = contenido[:80]
        return f"{recorte}…" if len(contenido) > 80 else recorte
    inicio = max(0, idx - alrededor)
    fin = min(len(contenido), idx + len(consulta) + alrededor)
    prefijo = "…" if inicio > 0 else ""
    sufijo = "…" if fin < len(contenido) else ""
    return f"{prefijo}{contenido[inicio:fin]}{sufijo}"


# IMPORTANTE: esta ruta debe declararse ANTES de /sesiones/{sesion_id} — si no,
# FastAPI interpreta "buscar" como el valor de sesion_id y nunca llega acá.
@app.get("/sesiones/buscar", response_model=list[ResultadoBusqueda])
def buscar_sesiones(
    q: str,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Busca en el NOMBRE de la conversación y en el CONTENIDO de sus
    mensajes (estilo WhatsApp) — nunca en netlist/instrucciones, que no son
    texto conversacional."""
    consulta = q.strip()
    if not consulta:
        return []

    patron = f"%{consulta}%"

    # Un mensaje por sesión (el más antiguo que matchee) para el fragmento.
    mensajes_coincidentes = (
        db.query(ChatMensaje)
        .join(Sesion, Sesion.id == ChatMensaje.sesion_id)
        .filter(Sesion.usuario_id == usuario.id, ChatMensaje.contenido.ilike(patron))
        .order_by(ChatMensaje.sesion_id, ChatMensaje.timestamp.asc())
        .all()
    )
    fragmento_por_sesion: dict[str, str] = {}
    for m in mensajes_coincidentes:
        sid = str(m.sesion_id)
        if sid not in fragmento_por_sesion:
            fragmento_por_sesion[sid] = _fragmento(m.contenido, consulta)

    ids_por_nombre = {
        str(s.id)
        for s in db.query(Sesion).filter(Sesion.usuario_id == usuario.id, Sesion.nombre.ilike(patron)).all()
    }

    ids_relevantes = set(fragmento_por_sesion) | ids_por_nombre
    if not ids_relevantes:
        return []

    sesiones = (
        db.query(Sesion)
        .filter(Sesion.id.in_(ids_relevantes))
        .order_by(Sesion.fecha.desc())
        .all()
    )

    return [
        ResultadoBusqueda(
            id=str(s.id),
            nombre=s.nombre,
            fecha=s.fecha,
            fragmento=fragmento_por_sesion.get(str(s.id)),
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
        imagen_esquema=sesion.imagen_esquema,
    )


@app.patch("/sesiones/{sesion_id}", response_model=SesionResumen)
def renombrar_sesion(
    sesion_id: str,
    datos: SesionRenombrar,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    sesion = _buscar_sesion_del_usuario(db, sesion_id, usuario.id)
    if sesion is None:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")

    sesion.nombre = datos.nombre
    db.commit()
    db.refresh(sesion)

    return SesionResumen(
        id=str(sesion.id),
        nombre=sesion.nombre,
        fecha=sesion.fecha,
        modo_detectado=sesion.modo_detectado,
    )


@app.post("/sesiones/{sesion_id}/finalizar")
def finalizar_sesion(
    sesion_id: str,
    datos: SesionFinalizar,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Guarda el tiempo total y el tiempo por paso (botón "Finalizar" del
    temporizador) en la misma columna JSONB que ya usa la pestaña Métricas
    (`metricas`) — se agregan estas claves, sin pisar lo que ya había ahí
    (extractor/planner/chat, ver _persistir_interaccion_chat)."""
    sesion = _buscar_sesion_del_usuario(db, sesion_id, usuario.id)
    if sesion is None:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")

    m = dict(sesion.metricas or {})
    m["tiempo_total_segundos"] = datos.tiempo_total_segundos
    m["tiempo_por_paso"] = datos.tiempo_por_paso
    m["inicio"] = datos.inicio.isoformat() if datos.inicio else None
    m["fin"] = datos.fin.isoformat() if datos.fin else None
    sesion.metricas = m
    db.commit()

    return {"ok": True}


@app.delete("/sesiones/{sesion_id}", status_code=204)
def borrar_sesion(
    sesion_id: str,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    sesion = _buscar_sesion_del_usuario(db, sesion_id, usuario.id)
    if sesion is None:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")

    # Los ChatMensaje de esta sesión se borran solos (ondelete="CASCADE" en el
    # modelo) — no hace falta borrarlos a mano acá.
    db.delete(sesion)
    db.commit()


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


def _buscar_sesion_por_token(db: Session, token: str) -> Sesion | None:
    """Busca una sesión por su token de compartir — a propósito NO filtra por
    dueño: el token en sí es la credencial de acceso a este link puntual."""
    return db.query(Sesion).filter(Sesion.token_compartido == token).first()


@app.post("/sesiones/{sesion_id}/compartir", response_model=SesionCompartirResponse)
def compartir_sesion(
    sesion_id: str,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Genera (o reutiliza) el link para compartir esta sesión. Solo el dueño
    puede generarlo. Idempotente a propósito: si ya se había compartido, se
    devuelve el mismo token en vez de invalidar links que ya se repartieron."""
    sesion = _buscar_sesion_del_usuario(db, sesion_id, usuario.id)
    if sesion is None:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")

    if not sesion.token_compartido:
        sesion.token_compartido = secrets.token_urlsafe(16)
        db.commit()
        db.refresh(sesion)

    return SesionCompartirResponse(token=sesion.token_compartido)


@app.get("/sesiones/compartidas/{token}", response_model=SesionCompartidaPreview)
def vista_previa_compartida(
    token: str,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Preview antes de importar — a propósito NO expone netlist/instrucciones/
    historial completos acá, solo lo necesario para decidir si importarla."""
    sesion = _buscar_sesion_por_token(db, token)
    if sesion is None:
        raise HTTPException(status_code=404, detail="Este link de circuito compartido no es válido.")

    cantidad_mensajes = db.query(ChatMensaje).filter(ChatMensaje.sesion_id == sesion.id).count()

    return SesionCompartidaPreview(nombre=sesion.nombre, fecha=sesion.fecha, cantidad_mensajes=cantidad_mensajes)


@app.post("/sesiones/compartidas/{token}/importar", response_model=SesionImportada, status_code=201)
def importar_sesion_compartida(
    token: str,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Trae una COPIA independiente de la sesión compartida a la cuenta de
    quien importa — netlist, instrucciones, esquemático y el historial de chat
    hasta este momento. A partir de aquí las dos copias siguen su propio
    camino; nada queda enlazado con la sesión original (ver modelo elegido en
    el comentario junto a SesionCompartirResponse)."""
    original = _buscar_sesion_por_token(db, token)
    if original is None:
        raise HTTPException(status_code=404, detail="Este link de circuito compartido no es válido.")

    copia = Sesion(
        usuario_id=usuario.id,
        nombre=original.nombre,
        netlist=original.netlist,
        instrucciones=original.instrucciones,
        imagen_esquema=original.imagen_esquema,
        modo_detectado=original.modo_detectado,
        metricas=original.metricas,
    )
    db.add(copia)
    db.flush()  # asigna copia.id sin cerrar la transacción, para copiar los mensajes abajo

    mensajes_originales = (
        db.query(ChatMensaje)
        .filter(ChatMensaje.sesion_id == original.id)
        .order_by(ChatMensaje.timestamp.asc())
        .all()
    )
    for m in mensajes_originales:
        db.add(ChatMensaje(sesion_id=copia.id, rol=m.rol, contenido=m.contenido, modo_detectado=m.modo_detectado))

    db.commit()
    db.refresh(copia)

    return SesionImportada(sesion_id=str(copia.id))


@app.post("/analizar")
async def analizar_esquematico(
    imagen: UploadFile = File(...),
    proveedor: str = Form(...),
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    if proveedor not in PROVEEDORES_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Proveedor '{proveedor}' no válido. Valores válidos: {PROVEEDORES_VALIDOS}"
        )

    # API keys propias del usuario, guardadas cifradas en su cuenta (Mi cuenta
    # → API keys propias) — una por proveedor real, no por slot. Si el
    # proveedor elegido no tiene key propia guardada, se cae a la del servidor
    # y esa llamada sí consume el presupuesto compartido.
    api_key_efectiva = resolver_api_key_usuario(proveedor, descifrar_api_keys(usuario.api_keys_cifradas))

    verificar_frecuencia(f"user:{usuario.id}")

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

    resultado = await ejecutar_extractor(contenido, imagen.content_type, proveedor, api_key_efectiva)
    _marcar_sin_facturacion(db, usuario, resultado.get("sin_facturacion_grupo"))

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
    # Solo se atribuye al costo/consumo del servidor si la llamada usó la key
    # del servidor — si el usuario trajo la suya, ese gasto no ocurrió en la
    # cuenta común y no debe mezclarse en las métricas agregadas.
    if not api_key_efectiva:
        metricas.registrar(tokens_entrada, tokens_salida, proveedor)

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

    keys_por_grupo = descifrar_api_keys(usuario.api_keys_cifradas)
    api_key_razon_efectiva = resolver_api_key_usuario(proveedor_razon, keys_por_grupo)

    try:
        netlist_dict = json.loads(netlist)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="El campo 'netlist' no es un JSON válido.")

    verificar_frecuencia(f"user:{usuario.id}")

    estado_extractor = {
        "imagen_base64": "",
        "mime_type": "",
        "proveedor": proveedor,
        "proveedor_razon": proveedor_razon,
        "api_key_razon": api_key_razon_efectiva,
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
    _marcar_sin_facturacion(db, usuario, resultado.get("sin_facturacion_grupo"))

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
    if not api_key_razon_efectiva:
        metricas.registrar(tokens_entrada, tokens_salida, proveedor_razon)

    # Las instrucciones ya vienen redactadas según el nivel desde el planner
    # (una sola llamada LLM que usa reglas_nivel); no hay una segunda pasada de
    # redacción — por eso el planner corre con el proveedor elegido y no se
    # fuerza OpenAI a mitad del pipeline.
    resultado["metricas"] = metricas.resumen(proveedor_razon)

    # Diagnóstico del tipo de interacción de la PRIMERA interacción de la
    # sesión (#82) — nunca un default fijo ni derivado del nivel, siempre un
    # diagnóstico real del LLM (ver agents/deteccion_interaccion.py). El
    # frontend lo reenvía como `modo` al crear la sesión (POST /sesiones). Es
    # metadata auxiliar de investigación: si el proveedor falla acá (rate
    # limit, caído), no debe tumbar la respuesta del plan ya generado.
    try:
        proveedor_diagnostico = crear_provider_chat(proveedor_razon, api_key_razon_efectiva)
        resultado["tipo_interaccion_inicial"] = await diagnosticar_interaccion_inicial(
            nivel, proveedor_diagnostico, proveedor_razon,
        )
    except Exception:
        resultado["tipo_interaccion_inicial"] = None

    return resultado


def _persistir_interaccion_chat(db, sesion, historial_list, resultado, tipo_interaccion, intencion):
    """Guarda el nuevo par de mensajes (usuario + asistente) como filas
    ChatMensaje —fuente de verdad del historial—, refleja en la sesión los
    cambios de circuito que hizo el chat, acumula métricas y recalcula el modo
    predominante.

    `tipo_interaccion` ya viene diagnosticado por el LLM (#82, ver
    agents/deteccion_interaccion.py y el clasificador de chat_agent_v2.py) —
    esta función solo lo persiste, no lo calcula."""

    # El nuevo mensaje del usuario es el último del historial que envía el
    # frontend (lo agrega justo antes de mandar la petición).
    if historial_list and historial_list[-1].get("rol") == "user":
        db.add(ChatMensaje(
            sesion_id=sesion.id,
            rol="user",
            contenido=historial_list[-1].get("contenido", ""),
            modo_detectado=tipo_interaccion,
        ))

    respuesta = resultado.get("respuesta", "")
    if respuesta:
        db.add(ChatMensaje(
            sesion_id=sesion.id,
            rol="assistant",
            contenido=respuesta,
            modo_detectado=tipo_interaccion,
        ))

    # Si el chat modificó el circuito, la sesión guarda el estado nuevo.
    if intencion != "responder":
        if resultado.get("netlist_modificado"):
            sesion.netlist = resultado["netlist_modificado"]
        if resultado.get("instrucciones_actualizadas"):
            sesion.instrucciones = resultado["instrucciones_actualizadas"]

    # Métricas de la sesión (columna JSONB). Forma unificada que consume la
    # pestaña "Métricas" del front: {extractor, planner, chat[]}. El análisis
    # inicial (extractor/planner) lo guardó crear_sesion; acá solo se agrega
    # cada interacción del chat a la lista `chat`, para que sobreviva a recargar
    # o reabrir la sesión desde el historial. Se reasigna el dict completo para
    # que SQLAlchemy detecte el cambio en la columna JSONB.
    uso = resultado.get("uso", {})
    m = dict(sesion.metricas or {})
    chat = list(m.get("chat", []))
    chat.append({"uso": uso, "intencion": intencion, "tipo_interaccion": tipo_interaccion})
    m["chat"] = chat
    sesion.metricas = m

    db.commit()

    # Modo predominante = el más frecuente entre los mensajes de la sesión,
    # ya con el tipo real diagnosticado por el LLM en cada turno (#82).
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

    # API keys propias del usuario, guardadas cifradas en su cuenta (/chat
    # corre siempre en razón, nunca visión). Ver /analizar.
    api_key_razon_efectiva = resolver_api_key_usuario(
        proveedor_razon, descifrar_api_keys(usuario.api_keys_cifradas)
    )

    verificar_frecuencia(f"user:{usuario.id}")

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

    estado = {
        "imagen_base64": "",
        "mime_type": "",
        "proveedor": proveedor,
        "proveedor_razon": proveedor_razon,
        "api_key_razon": api_key_razon_efectiva,
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
        # Diagnosticado por el clasificador del chat en esta misma llamada al
        # LLM (#82, ver agents/chat_agent_v2.py) — nunca derivado del nivel.
        tipo_interaccion = resultado.get("tipo_interaccion_detectado", "UNDER")

        # Todo el trabajo de /chat (clasificar, modificar, responder) es
        # razonamiento sobre texto — no hay imagen en esta ruta — así que se
        # atribuye a proveedor_razon, no a proveedor (visión). El chat consume
        # tokens en cualquier intención, así que se registra siempre (no solo
        # en la rama de modificación). Si trajo su propia key, esa llamada no
        # se atribuye al consumo de la cuenta común.
        uso_chat = resultado.get("uso", {})
        if not api_key_razon_efectiva:
            metricas.registrar(uso_chat.get("tokens_entrada", 0), uso_chat.get("tokens_salida", 0), proveedor_razon)

        if intencion == "responder":
            yield _evento_sse("respuesta", {
                "contenido": resultado.get("respuesta", ""),
                "intencion_detectada": intencion,
                "tipo_interaccion_detectado": tipo_interaccion,
                "uso": resultado.get("uso", {}),
            })
        else:
            yield _evento_sse("actualizado", {
                "respuesta": resultado.get("respuesta", ""),
                "intencion_detectada": intencion,
                "tipo_interaccion_detectado": tipo_interaccion,
                "instrucciones_actualizadas": resultado.get("instrucciones_actualizadas"),
                "netlist_modificado": resultado.get("netlist_modificado"),
                "posiciones_modificadas": resultado.get("posiciones_modificadas"),
                "uso": resultado.get("uso", {}),
            })

        # Persistencia (#73): solo si la petición trae una sesión válida. Un
        # fallo al guardar no debe romper la respuesta ya enviada al usuario.
        if sesion is not None:
            try:
                _persistir_interaccion_chat(db, sesion, historial_list, resultado, tipo_interaccion, intencion)
            except Exception:
                db.rollback()

    return StreamingResponse(generador(), media_type="text/event-stream")

from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid
from db.database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    contrasena_hash = Column(String(255), nullable=False)
    nivel = Column(String(20), nullable=False, default="basico")
    # True solo cuando el usuario completó la encuesta de nivel (#72). Distingue
    # "aún no contestó" de "contestó y su respuesta fue básico" — ambos casos
    # comparten el mismo valor por defecto en `nivel`, así que no se pueden
    # diferenciar sin este flag.
    nivel_confirmado = Column(Boolean, nullable=False, default=False)
    fecha_registro = Column(DateTime(timezone=True), server_default=func.now())


class Sesion(Base):
    __tablename__ = "sesiones"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Si se borra un usuario, se borran en cascada todas sus sesiones.
    usuario_id = Column(
        UUID(as_uuid=True),
        ForeignKey("usuarios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    netlist = Column(JSONB)
    instrucciones = Column(JSONB)
    historial_chat = Column(JSONB)
    # Modo de interacción predominante de la sesión (resumen calculado a partir
    # de los mensajes). La fuente de verdad por-mensaje vive en ChatMensaje.
    modo_detectado = Column(String(20))
    metricas = Column(JSONB)
    fecha = Column(DateTime(timezone=True), server_default=func.now())


class ChatMensaje(Base):
    __tablename__ = "chat_mensajes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Si se borra una sesión, se borran en cascada todos sus mensajes.
    sesion_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sesiones.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rol = Column(String(20), nullable=False)
    contenido = Column(Text, nullable=False)
    modo_detectado = Column(String(20))
    # Indexado porque el historial se consulta ordenado cronológicamente.
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)

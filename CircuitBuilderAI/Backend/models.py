from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid
from database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    contrasena_hash = Column(String(255), nullable=False)
    nivel = Column(String(20), nullable=False, default="basico")
    fecha_registro = Column(DateTime(timezone=True), server_default=func.now())


class Sesion(Base):
    __tablename__ = "sesiones"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=False)
    netlist = Column(JSONB)
    instrucciones = Column(JSONB)
    historial_chat = Column(JSONB)
    modo_detectado = Column(String(20)) 
    metricas = Column(JSONB)
    fecha = Column(DateTime(timezone=True), server_default=func.now())


class ChatMensaje(Base):
    __tablename__ = "chat_mensajes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sesion_id = Column(UUID(as_uuid=True), ForeignKey("sesiones.id"), nullable=False)
    rol = Column(String(20), nullable=False)
    contenido = Column(Text, nullable=False)
    modo_detectado = Column(String(20))
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

"""Autenticación: hashing de contraseñas (Argon2) y JWT (PyJWT).

Reúne el trabajo de los issues #71 (registro/login), #74 (hashing con Argon2)
y #75 (manejo seguro del secreto JWT), porque un registro/login seguro no puede
existir sin hashing ni sin un secreto bien gestionado.
"""

import os
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Usuario

load_dotenv()

# El secreto NUNCA se hardcodea: se lee del entorno. Si falta, el arranque de la
# app no falla, pero cualquier operación con tokens lanza un error explícito.
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_ALGORITMO = "HS256"
# 7 días por defecto (ver decisión de diseño del #71/#75).
JWT_EXPIRA_MINUTOS = int(os.getenv("JWT_EXPIRA_MINUTOS", str(60 * 24 * 7)))

# Una sola instancia reutilizable; trae parámetros por defecto seguros.
_hasher = PasswordHasher()

# Lee el header "Authorization: Bearer <token>".
_bearer = HTTPBearer()


# --- Esquemas de request/response ---

class RegistroRequest(BaseModel):
    nombre: str = Field(min_length=1, max_length=100)
    email: EmailStr
    # Mínimo 12 caracteres (la longitud aporta la mayor parte de la fortaleza).
    # El máximo evita entradas gigantes que saturen el hashing de Argon2.
    contrasena: str = Field(min_length=12, max_length=128)
    nivel: str = "basico"

    @field_validator("contrasena")
    @classmethod
    def validar_complejidad(cls, valor: str) -> str:
        # Se exige mayúscula, minúscula y número. Los caracteres especiales se
        # permiten pero no se obligan.
        if not any(c.isupper() for c in valor):
            raise ValueError("La contraseña debe incluir al menos una mayúscula.")
        if not any(c.islower() for c in valor):
            raise ValueError("La contraseña debe incluir al menos una minúscula.")
        if not any(c.isdigit() for c in valor):
            raise ValueError("La contraseña debe incluir al menos un número.")
        return valor


class LoginRequest(BaseModel):
    email: EmailStr
    contrasena: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario_id: str
    nombre: str
    nivel: str


# --- Hashing de contraseñas (Argon2) ---

def hashear_contrasena(contrasena: str) -> str:
    return _hasher.hash(contrasena)


def verificar_contrasena(hash_almacenado: str, contrasena: str) -> bool:
    try:
        _hasher.verify(hash_almacenado, contrasena)
        return True
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


# --- JWT ---

def crear_token(usuario_id) -> str:
    if not JWT_SECRET_KEY:
        raise RuntimeError("JWT_SECRET_KEY no está configurada en el entorno (.env).")
    ahora = datetime.now(timezone.utc)
    payload = {
        "sub": str(usuario_id),
        "iat": ahora,
        "exp": ahora + timedelta(minutes=JWT_EXPIRA_MINUTOS),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITMO)


def obtener_usuario_actual(
    credenciales: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Usuario:
    """Dependencia para proteger endpoints. Valida el token y devuelve el usuario.

    Todavía no se aplica a los endpoints existentes (/procesar, /chat, …) porque
    el frontend aún no envía token; se conectará al implementar la persistencia
    de sesiones (#73).
    """
    if not JWT_SECRET_KEY:
        raise RuntimeError("JWT_SECRET_KEY no está configurada en el entorno (.env).")

    excepcion = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido o expirado.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            credenciales.credentials, JWT_SECRET_KEY, algorithms=[JWT_ALGORITMO]
        )
        usuario_id = payload.get("sub")
        if usuario_id is None:
            raise excepcion
    except jwt.PyJWTError:
        raise excepcion

    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if usuario is None:
        raise excepcion
    return usuario

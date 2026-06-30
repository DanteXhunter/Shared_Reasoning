from pydantic import BaseModel, field_validator
from typing import Optional


class Pin(BaseModel):
    nombre: str
    funcion: str


class Propiedades(BaseModel):
    model_config = {"extra": "allow"}


class Componente(BaseModel):
    id: str
    tipo: str
    valor: str
    unidad: str
    propiedades: Optional[Propiedades] = None
    pines: list[Pin]

    @field_validator("pines")
    @classmethod
    def al_menos_un_pin(cls, v):
        if len(v) == 0:
            raise ValueError("El componente debe tener al menos un pin")
        return v


class Conexion(BaseModel):
    de: str
    a: str
    descripcion: Optional[str] = None


class Netlist(BaseModel):
    componentes: list[Componente]
    conexiones: list[Conexion]

    @field_validator("componentes")
    @classmethod
    def al_menos_un_componente(cls, v):
        if len(v) == 0:
            raise ValueError("El netlist debe tener al menos un componente")
        return v

    @field_validator("conexiones")
    @classmethod
    def al_menos_una_conexion(cls, v):
        if len(v) == 0:
            raise ValueError("El netlist debe tener al menos una conexión")
        return v
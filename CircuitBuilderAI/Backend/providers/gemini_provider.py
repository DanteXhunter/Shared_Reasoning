from google import genai
import os
import json
from dotenv import load_dotenv
from .base import LLMProvider
from google.genai import errors as genai_errors
from fastapi import HTTPException

load_dotenv()

MODELOS = {
    "gemini": "gemini-2.5-flash",
    "gemini-free": "gemini-2.5-flash-lite",
}


class GeminiProvider(LLMProvider):
    def __init__(self, variante: str = "gemini-free"):
        self.client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        self.model = MODELOS.get(variante, "models/gemini-2.5-flash-lite")
        self.tokens_consumidos_sesion = 0

    async def analizar_esquematico(self, imagen_bytes: bytes, mime_type: str) -> dict:
        prompt = """
        Analiza este esquemático eléctrico y extrae todos los componentes y sus conexiones.
        Responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin bloques de código markdown.

        Estructura requerida:
        {
            "componentes": [
                {
                    "id": "R1",
                    "tipo": "resistencia",
                    "valor": "10k",
                    "unidad": "ohm",
                    "propiedades": {
                        "potencia_nominal": "0.25W",
                        "tolerancia": "5%"
                    },
                    "pines": [
                        {"nombre": "pin1", "funcion": "terminal_a"},
                        {"nombre": "pin2", "funcion": "terminal_b"}
                    ]
                }
            ],
            "conexiones": [
                {
                    "de": "R1.pin1",
                    "a": "VCC",
                    "descripcion": "conexión a alimentación"
                }
            ]
        }

        Reglas:
        - Incluye TODOS los componentes visibles en el esquemático
        - En "propiedades" incluye solo las características que puedas identificar: polaridad, voltaje máximo, corriente, potencia, tolerancia, tipo (NPN/PNP), etc.
        - Si un valor no es visible en el esquemático, omite esa propiedad en lugar de poner null
        - Los pines deben tener nombres específicos según el componente: base/colector/emisor para transistores, anodo/catodo para diodos y LEDs, etc.
        - En "conexiones" describe cada conexión entre pines o hacia nodos como VCC, GND, etc.
        """
        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=[
                    prompt,
                    genai.types.Part.from_bytes(data=imagen_bytes, mime_type=mime_type),
                ],
            )
            tokens_esta_llamada = response.usage_metadata.total_token_count
            self.tokens_consumidos_sesion += tokens_esta_llamada
            texto = response.text.strip().replace("```json", "").replace("```", "").strip()
            return {
                "resultado": json.loads(texto),
                "uso": {
                    "tokens_esta_llamada": tokens_esta_llamada,
                    "tokens_entrada": response.usage_metadata.prompt_token_count,
                    "tokens_salida": response.usage_metadata.candidates_token_count,
                    "tokens_sesion": self.tokens_consumidos_sesion,
                    "modelo_activo": self.model,
                },
            }
        except genai_errors.ClientError as e:
            raise HTTPException(status_code=e.status_code, detail=str(e.message))
        except genai_errors.ServerError as e:
            raise HTTPException(status_code=503, detail="El modelo está saturado, intenta de nuevo en unos segundos.")
        except json.JSONDecodeError:
            raise HTTPException(status_code=422, detail="Gemini respondió pero el JSON no es válido. Intenta con otra imagen.")

    async def generar_instrucciones(self, netlist: dict) -> str:
        prompt = f"""
        Dado este netlist de un circuito eléctrico:
        {json.dumps(netlist, ensure_ascii=False)}

        Genera instrucciones paso a paso para armar el circuito en una protoboard.
        Cada instrucción debe incluir: componente, fila, columna y color de cable si aplica.
        """
        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
        )
        return response.text

    async def chat(self, mensaje: str, historial: list) -> str:
        response = self.client.models.generate_content(
            model=self.model,
            contents=historial + [{"role": "user", "parts": [mensaje]}],
        )
        return response.text
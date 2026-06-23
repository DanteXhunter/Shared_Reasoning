from google import genai
import os
import json
from dotenv import load_dotenv
from .base import LLMProvider

load_dotenv()

class GeminiProvider(LLMProvider):
    
    def __init__(self):
        self.client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        self.model = "gemini-2.0-flash"
    
    async def analizar_esquematico(self, imagen_bytes: bytes, mime_type: str) -> dict:
        prompt = """
        Analiza este esquemático eléctrico y extrae todos los componentes y sus conexiones.
        Responde ÚNICAMENTE con un JSON válido con esta estructura:
        {
            "componentes": [
                {
                    "id": "R1",
                    "tipo": "resistencia",
                    "valor": "10k",
                    "pines": ["pin1", "pin2"]
                }
            ],
            "conexiones": [
                {
                    "de": "R1.pin1",
                    "a": "VCC"
                }
            ]
        }
        """
        response = self.client.models.generate_content(
            model=self.model,
            contents=[
                prompt,
                genai.types.Part.from_bytes(data=imagen_bytes, mime_type=mime_type)
            ]
        )
        texto = response.text.strip().replace("```json", "").replace("```", "")
        return json.loads(texto)

    async def generar_instrucciones(self, netlist: dict) -> str:
        prompt = f"""
        Dado este netlist de un circuito eléctrico:
        {json.dumps(netlist, ensure_ascii=False)}
        
        Genera instrucciones paso a paso para armar el circuito en una protoboard.
        Cada instrucción debe incluir: componente, fila, columna y color de cable si aplica.
        """
        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt
        )
        return response.text

    async def chat(self, mensaje: str, historial: list) -> str:
        response = self.client.models.generate_content(
            model=self.model,
            contents=historial + [{"role": "user", "parts": [mensaje]}]
        )
        return response.text
from openai import AsyncOpenAI
import os
import json
from dotenv import load_dotenv
from .base import LLMProvider
from fastapi import HTTPException
import base64

load_dotenv()


class MLLMProvider(LLMProvider):
    def __init__(
        self,
        model: str = "gpt-4o-mini",
        base_url: str | None = None,
        api_key: str | None = None,
    ):
        # base_url permite reutilizar este provider con cualquier endpoint
        # compatible con /v1/chat/completions (Gemini, NVIDIA NIM, etc.) sin
        # duplicar la clase — ver CLAUDE.md §7.
        self.client = AsyncOpenAI(
            api_key=api_key or os.getenv("OPENAI_API_KEY"),
            base_url=base_url,
            timeout=30.0,
            max_retries=0,
        )
        self.model = model
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
            imagen_base64 = base64.b64encode(imagen_bytes).decode("utf-8")
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime_type};base64,{imagen_base64}"
                                },
                            },
                        ],
                    }
                ],
                response_format={"type": "json_object"},
            )
            tokens_esta_llamada = response.usage.total_tokens
            self.tokens_consumidos_sesion += tokens_esta_llamada
            texto_raw = response.choices[0].message.content or ""
            texto = texto_raw.strip().replace("```json", "").replace("```", "").strip()
            return {
                "resultado": json.loads(texto),
                "uso": {
                    "tokens_esta_llamada": tokens_esta_llamada,
                    "tokens_entrada": response.usage.prompt_tokens,
                    "tokens_salida": response.usage.completion_tokens,
                    "tokens_sesion": self.tokens_consumidos_sesion,
                    "modelo_activo": self.model,
                },
            }
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=422,
                detail=f"El modelo respondió pero el JSON no es válido. Error: {str(e)}. Respuesta recibida: {texto_raw[:200]}"
            )
        except Exception as e:
            error_str = str(e).lower()
            if "timeout" in error_str or "timed out" in error_str:
                raise HTTPException(status_code=504, detail="El modelo tardó demasiado en responder. Intenta de nuevo.")
            if "connection" in error_str:
                raise HTTPException(status_code=503, detail="No se pudo conectar con el modelo. Intenta de nuevo.")
            raise HTTPException(status_code=500, detail=str(e))

    async def generar_instrucciones(self, netlist: dict) -> str:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "user",
                    "content": f"""
                    Dado este netlist de un circuito eléctrico:
                    {json.dumps(netlist, ensure_ascii=False)}
                    Genera instrucciones paso a paso para armar el circuito en una protoboard.
                    Cada instrucción debe incluir: componente, fila, columna y color de cable si aplica.
                    """,
                }
            ],
        )
        return response.choices[0].message.content

    async def chat(self, mensaje: str, historial: list) -> str:
        mensajes = historial + [{"role": "user", "content": mensaje}]
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=mensajes,
        )
        return response.choices[0].message.content
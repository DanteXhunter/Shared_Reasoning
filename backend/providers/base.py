from abc import ABC, abstractmethod

class LLMProvider(ABC):
    
    @abstractmethod
    async def analizar_esquematico(self, imagen_bytes: bytes, mime_type: str) -> dict:
        """
        Recibe una imagen de un esquemático eléctrico y retorna un JSON
        con los componentes y la topología del circuito (netlist).
        """
        pass

    @abstractmethod
    async def generar_instrucciones(self, netlist: dict) -> str:
        """
        Recibe el netlist JSON y retorna instrucciones de armado
        con coordenadas físicas de la protoboard.
        """
        pass

    @abstractmethod
    async def chat(self, mensaje: str, historial: list) -> str:
        """
        Recibe un mensaje del usuario y el historial de conversación
        y retorna una respuesta en texto.
        """
        pass
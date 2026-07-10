from datetime import date

LIMITES = {
    # gemini-2.5-flash no tiene capa gratuita: exige créditos prepago en la
    # cuenta. Se factura por saldo, igual que OpenAI.
    "gemini": {"tipo": "saldo", "peso_max_mb": 20, "costo_input_por_millon": 0.30, "costo_output_por_millon": 2.50},
    "gemini-free": {"tipo": "diario", "peticiones_dia": 1000, "peso_max_mb": 20},
    "nemotron": {"tipo": "diario", "peticiones_dia": 33, "peso_max_mb": 5},
    "llama-vision": {"tipo": "diario", "peticiones_dia": 33, "peso_max_mb": 5},
    "openai": {"tipo": "saldo", "peso_max_mb": 20, "costo_input_por_millon": 0.15, "costo_output_por_millon": 0.60},
    "ollama": {"tipo": "local", "peso_max_mb": 50}
}

class Metricas:
    def __init__(self):
        self.peticiones_hoy = 0
        self.fecha_actual = date.today()
        self.tokens_entrada_sesion = 0
        self.tokens_salida_sesion = 0
        self.tokens_total_sesion = 0
        self.peticiones_total = 0
        self.costo_acumulado_usd = 0.0

    def _resetear_si_nuevo_dia(self):
        if date.today() != self.fecha_actual:
            self.peticiones_hoy = 0
            self.fecha_actual = date.today()

    def registrar(self, tokens_entrada: int, tokens_salida: int, proveedor: str):
        self._resetear_si_nuevo_dia()
        self.peticiones_hoy += 1
        self.peticiones_total += 1
        self.tokens_entrada_sesion += tokens_entrada
        self.tokens_salida_sesion += tokens_salida
        self.tokens_total_sesion += tokens_entrada + tokens_salida

        config = LIMITES.get(proveedor, {})
        if config.get("tipo") == "saldo":
            costo_input = (tokens_entrada / 1_000_000) * config["costo_input_por_millon"]
            costo_output = (tokens_salida / 1_000_000) * config["costo_output_por_millon"]
            self.costo_acumulado_usd += costo_input + costo_output

    def restantes_hoy(self, proveedor: str) -> int:
        self._resetear_si_nuevo_dia()
        config = LIMITES.get(proveedor, {})
        if config.get("tipo") == "local":
            return -1
        if config.get("tipo") == "saldo":
            return -1
        limite = config.get("peticiones_dia", 0)
        return max(0, limite - self.peticiones_hoy)

    def puede_hacer_peticion(self, proveedor: str) -> bool:
        config = LIMITES.get(proveedor, {})
        if config.get("tipo") in ["local", "saldo"]:
            return True
        return self.restantes_hoy(proveedor) > 0

    def peso_maximo_bytes(self, proveedor: str) -> int:
        config = LIMITES.get(proveedor, {})
        mb = config.get("peso_max_mb", 5)
        return mb * 1024 * 1024

    def resumen(self, proveedor: str) -> dict:
        self._resetear_si_nuevo_dia()
        config = LIMITES.get(proveedor, {})
        tipo = config.get("tipo", "desconocido")

        resumen = {
            "proveedor": proveedor,
            "tipo_facturacion": tipo,
            "peticiones_hoy": self.peticiones_hoy,
            "peticiones_total": self.peticiones_total,
            "tokens_entrada_sesion": self.tokens_entrada_sesion,
            "tokens_salida_sesion": self.tokens_salida_sesion,
            "tokens_total_sesion": self.tokens_total_sesion
        }

        if tipo == "diario":
            resumen["limite_diario"] = config["peticiones_dia"]
            resumen["peticiones_restantes_hoy"] = self.restantes_hoy(proveedor)
        elif tipo == "saldo":
            resumen["costo_acumulado_usd"] = round(self.costo_acumulado_usd, 6)
            resumen["costo_estimado_por_peticion_usd"] = 0.001
        elif tipo == "local":
            resumen["nota"] = "Sin límites — modelo corre localmente"

        return resumen
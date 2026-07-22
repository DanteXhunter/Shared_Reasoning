from datetime import date

LIMITES = {
    # gemini-flash-latest no tiene capa gratuita: exige créditos prepago en la
    # cuenta. Se factura por saldo, igual que OpenAI.
    "gemini-flash-latest": {"tipo": "saldo", "peso_max_mb": 20, "costo_input_por_millon": 0.30, "costo_output_por_millon": 2.50},
    "gemini-flash-lite-latest": {"tipo": "diario", "peticiones_dia": 1000, "peso_max_mb": 20},
    "nemotron": {"tipo": "diario", "peticiones_dia": 33, "peso_max_mb": 5},
    "llama-vision": {"tipo": "diario", "peticiones_dia": 33, "peso_max_mb": 5},
    "gpt-4o-mini": {"tipo": "saldo", "peso_max_mb": 20, "costo_input_por_millon": 0.15, "costo_output_por_millon": 0.60},
    "ollama": {"tipo": "local", "peso_max_mb": 50},
    # Precios verificados por web search en julio 2026 (fuentes en el PR/commit
    # que agregó esto). Cambian sin aviso — reverificar si algo se ve caro/barato
    # de más en costo_acumulado_usd.
    #
    # o3-mini: sus tokens de "razonamiento" interno se facturan como salida,
    # pero ya vienen incluidos en usage.completion_tokens de la API — no hace
    # falta un cálculo aparte.
    "o3-mini": {"tipo": "saldo", "peso_max_mb": 20, "costo_input_por_millon": 0.55, "costo_output_por_millon": 2.20},
    "gemini-3.5-flash": {"tipo": "saldo", "peso_max_mb": 20, "costo_input_por_millon": 1.50, "costo_output_por_millon": 9.00},
    # gemini-3.1-pro tiene precio escalonado (más caro sobre 200K tokens de
    # contexto): $2.00/$12.00 hasta 200K, $4.00/$18.00 por encima. Se usa la
    # tarifa base porque los netlists de este proyecto son pequeños y casi
    # nunca cruzan ese umbral — si algún día lo hacen, el costo reportado
    # quedaría subestimado para esa llamada puntual.
    "gemini-3.1-pro": {"tipo": "saldo", "peso_max_mb": 20, "costo_input_por_millon": 2.00, "costo_output_por_millon": 12.00},
}

class Metricas:
    """Contadores de uso, SEPARADOS por proveedor.

    Antes esta clase guardaba un único juego de contadores compartido por todo
    el backend (self.tokens_total_sesion, self.costo_acumulado_usd, etc.), sin
    importar qué proveedor se le pasara a registrar()/resumen() — el parámetro
    solo elegía la tarifa de costo, pero los números se mezclaban entre todos
    los modelos. Con dos slots activos a la vez (visión y razonamiento,
    potencialmente proveedores distintos) eso hacía imposible saber cuánto
    consumió cada uno. Ahora cada proveedor tiene su propio registro en
    `_por_proveedor`, creado on-demand.

    La interfaz pública no cambió — mismos métodos, misma firma — así que
    ningún llamador en main.py necesitó actualizarse.
    """

    def __init__(self):
        self.fecha_actual = date.today()
        self._por_proveedor: dict[str, dict] = {}

    def _resetear_si_nuevo_dia(self):
        if date.today() != self.fecha_actual:
            self.fecha_actual = date.today()
            for registro in self._por_proveedor.values():
                registro["peticiones_hoy"] = 0

    def _registro(self, proveedor: str) -> dict:
        self._resetear_si_nuevo_dia()
        if proveedor not in self._por_proveedor:
            self._por_proveedor[proveedor] = {
                "peticiones_hoy": 0,
                "peticiones_total": 0,
                "tokens_entrada_sesion": 0,
                "tokens_salida_sesion": 0,
                "tokens_total_sesion": 0,
                "costo_acumulado_usd": 0.0,
            }
        return self._por_proveedor[proveedor]

    def registrar(self, tokens_entrada: int, tokens_salida: int, proveedor: str):
        r = self._registro(proveedor)
        r["peticiones_hoy"] += 1
        r["peticiones_total"] += 1
        r["tokens_entrada_sesion"] += tokens_entrada
        r["tokens_salida_sesion"] += tokens_salida
        r["tokens_total_sesion"] += tokens_entrada + tokens_salida

        config = LIMITES.get(proveedor, {})
        if config.get("tipo") == "saldo":
            costo_input = (tokens_entrada / 1_000_000) * config["costo_input_por_millon"]
            costo_output = (tokens_salida / 1_000_000) * config["costo_output_por_millon"]
            r["costo_acumulado_usd"] += costo_input + costo_output

    def restantes_hoy(self, proveedor: str) -> int:
        r = self._registro(proveedor)
        config = LIMITES.get(proveedor, {})
        if config.get("tipo") == "local":
            return -1
        if config.get("tipo") == "saldo":
            return -1
        limite = config.get("peticiones_dia", 0)
        return max(0, limite - r["peticiones_hoy"])

    def peso_maximo_bytes(self, proveedor: str) -> int:
        config = LIMITES.get(proveedor, {})
        mb = config.get("peso_max_mb", 5)
        return mb * 1024 * 1024

    def resumen(self, proveedor: str) -> dict:
        r = self._registro(proveedor)
        config = LIMITES.get(proveedor, {})
        tipo = config.get("tipo", "desconocido")

        resumen = {
            "proveedor": proveedor,
            "tipo_facturacion": tipo,
            "peticiones_hoy": r["peticiones_hoy"],
            "peticiones_total": r["peticiones_total"],
            "tokens_entrada_sesion": r["tokens_entrada_sesion"],
            "tokens_salida_sesion": r["tokens_salida_sesion"],
            "tokens_total_sesion": r["tokens_total_sesion"],
        }

        if tipo == "diario":
            resumen["limite_diario"] = config["peticiones_dia"]
            resumen["peticiones_restantes_hoy"] = self.restantes_hoy(proveedor)
        elif tipo == "saldo":
            resumen["costo_acumulado_usd"] = round(r["costo_acumulado_usd"], 6)
            resumen["costo_estimado_por_peticion_usd"] = 0.001
        elif tipo == "local":
            resumen["nota"] = "Sin límites — modelo corre localmente"

        return resumen
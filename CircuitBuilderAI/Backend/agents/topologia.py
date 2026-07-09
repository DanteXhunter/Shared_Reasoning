"""
Capa de FÍSICA del circuito (sin LLM) — la parte de la topología que NO es
negociable, no la de "dónde queda mejor cada cosa".

Este módulo solo responde una pregunta: "¿qué pines DEBEN quedar conectados
entre sí?" — agrupa los pines de un netlist en NETS (nodos eléctricos) vía
union-find, con resolución TOLERANTE de nombres de pin (pin1 ↔ terminal_a ↔
anodo ↔ 1) y detectando la fuente para marcar cuáles nets son + / −.

El ARMADO (en qué fila/columna va cada componente, qué cables se usan) lo
propone la IA (ver planner_agent.py); agents/validador.py usa construir_nets()
de aquí como la "verdad eléctrica" contra la cual comparar esa propuesta.
Esta separación es intencional: la física de una protoboard (qué huecos
están conectados) es una regla fija, pero CÓMO se arma un circuito admite
muchas soluciones válidas — eso debe decidirlo la IA (y negociarse con el
usuario), no quedar fijo en código.
"""
from __future__ import annotations
import re
from typing import Optional

COLS_IZQ = ["a", "b", "c", "d", "e"]  # un strip: 5 huecos conectados entre sí
COLS_DER = ["f", "g", "h", "i", "j"]
MAX_FILA = 30
PASO_FILA = 2  # separación entre strips de nets distintos (legibilidad)

# Sinónimos de nodos de poder (se comparan en minúsculas, sin espacios).
ALIAS_POS = {"vcc", "+v", "v+", "+", "pwr", "alimentacion", "alimentación",
             "vin", "v_in", "pos", "positivo", "5v", "3v3", "3.3v", "9v", "12v", "vdd"}
ALIAS_NEG = {"gnd", "grd", "tierra", "0v", "vss", "-", "v-", "neg", "negativo", "ground"}

# Tipos que son una fuente de alimentación (no ocupan strip; definen los rieles).
TIPOS_FUENTE = {"fuente", "batería", "bateria", "battery", "voltaje", "voltage",
                "pila", "generador", "source", "dc", "vcc", "alimentacion", "alimentación"}


def _norm(s: str) -> str:
    return (s or "").strip().lower()


def es_fuente(componente: dict) -> bool:
    tipo = _norm(componente.get("tipo", ""))
    return any(k in tipo for k in TIPOS_FUENTE)


def es_pin_positivo(pin: dict) -> bool:
    """¿Este pin de una fuente es el terminal positivo?"""
    texto = f"{_norm(pin.get('nombre',''))} {_norm(pin.get('funcion',''))}"
    if any(a in texto for a in ("+", "pos", "vcc", "vin", "v_in", "vdd")):
        return True
    if any(a in texto for a in ("-", "neg", "gnd", "vss", "tierra")):
        return False
    return True  # por defecto, el primero es el positivo


def resolver_pin(componente: dict, pin_ref: str) -> Optional[str]:
    """
    Devuelve el nombre REAL del pin del componente que corresponde a `pin_ref`,
    de forma tolerante. None si no hay ninguna coincidencia razonable.
    """
    pines = componente.get("pines", [])
    nombres = [p.get("nombre", "") for p in pines]
    ref = _norm(pin_ref)

    # 1) match exacto por nombre
    for n in nombres:
        if _norm(n) == ref:
            return n
    # 2) pinN / pN / terminalN / N → índice (1-based)
    m = re.match(r"^(?:pin|p|terminal|t|pata|leg)?[_\s-]*(\d+)$", ref)
    if m:
        idx = int(m.group(1)) - 1
        if 0 <= idx < len(nombres):
            return nombres[idx]
    # 3) match por función
    for p in pines:
        if _norm(p.get("funcion", "")) == ref:
            return p.get("nombre")
    # 4) coincidencia parcial (anodo↔anode, base↔b...)
    for n in nombres:
        nn = _norm(n)
        if nn and (nn in ref or ref in nn):
            return n
    return None


class _DSU:
    """Union-Find para agrupar endpoints en nets."""
    def __init__(self):
        self.parent: dict = {}

    def find(self, x):
        self.parent.setdefault(x, x)
        root = x
        while self.parent[root] != root:
            root = self.parent[root]
        while self.parent[x] != root:
            self.parent[x], x = root, self.parent[x]
        return root

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


def construir_nets(netlist: dict) -> tuple[list[dict], list[str]]:
    """
    Agrupa todos los endpoints (pines de componentes y nodos con nombre) en nets.
    Cada net: {"tipo": "positivo"|"negativo"|"senal", "pines": [(comp_id, pin)], "nodos": [nombre]}
    """
    componentes = netlist.get("componentes", [])
    comp_by_id = {c["id"]: c for c in componentes}
    avisos: list[str] = []
    dsu = _DSU()

    def canon(ref: str):
        ref = (ref or "").strip()
        if "." in ref:
            comp_id, pin_ref = ref.split(".", 1)
            comp = comp_by_id.get(comp_id)
            if comp is None:
                avisos.append(f"'{ref}': el componente '{comp_id}' no existe en el netlist; se trata como nodo suelto.")
                return ("nodo", _norm(ref))
            pin_real = resolver_pin(comp, pin_ref)
            if pin_real is None:
                pines = comp.get("pines", [])
                pin_real = pines[0]["nombre"] if pines else pin_ref
                avisos.append(f"'{ref}': pin '{pin_ref}' no encontrado en {comp_id}; se usó '{pin_real}'.")
            return ("pin", comp_id, pin_real)
        return ("nodo", _norm(ref))

    # Registrar todos los pines de todos los componentes (para detectar flotantes).
    for c in componentes:
        for p in c.get("pines", []):
            dsu.find(("pin", c["id"], p.get("nombre", "")))

    for con in netlist.get("conexiones", []):
        dsu.union(canon(con.get("de", "")), canon(con.get("a", "")))

    # Agrupar por raíz.
    grupos: dict = {}
    for x in list(dsu.parent.keys()):
        grupos.setdefault(dsu.find(x), []).append(x)

    nets: list[dict] = []
    net_por_raiz: dict = {}
    for raiz, miembros in grupos.items():
        tipo = "senal"
        nodos = [m[1] for m in miembros if m[0] == "nodo"]
        for nombre in nodos:
            if nombre in ALIAS_POS:
                tipo = "positivo"
            elif nombre in ALIAS_NEG:
                tipo = "negativo"
        pines = [(m[1], m[2]) for m in miembros if m[0] == "pin"]
        net = {"tipo": tipo, "pines": pines, "nodos": nodos}
        nets.append(net)
        net_por_raiz[raiz] = net

    # La FUENTE define los rieles: marcar el net de cada pin de fuente.
    for c in componentes:
        if not es_fuente(c):
            continue
        for p in c.get("pines", []):
            raiz = dsu.find(("pin", c["id"], p.get("nombre", "")))
            net = net_por_raiz.get(raiz)
            if net is not None:
                net["tipo"] = "positivo" if es_pin_positivo(p) else "negativo"

    # Avisos de salud del circuito: pines que no conectan con nada.
    ids_fuente = {c["id"] for c in componentes if es_fuente(c)}
    for net in nets:
        if net["tipo"] == "senal" and len(net["pines"]) == 1 and not net["nodos"]:
            cid, pin = net["pines"][0]
            if cid not in ids_fuente:
                avisos.append(f"Pin flotante: {cid}.{pin} no conecta con nada.")
    return nets, avisos

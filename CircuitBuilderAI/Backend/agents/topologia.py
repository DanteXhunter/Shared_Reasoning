"""
Capa DETERMINÍSTICA de topología eléctrica (sin LLM).

Traduce un netlist (componentes + conexiones par-a-par) a instrucciones de
armado en protoboard, agrupando pines en NETS (nodos eléctricos) y colocando
cada net en un STRIP físico (una fila, columnas a-e conectadas entre sí).

Principios (robustez que pidió el proyecto):
  1. Nada se descarta en silencio. Todo lo dudoso queda en `avisos`.
  2. La FUENTE define los rieles: el net del pin + va al riel +, el del − al −.
     Sus conexiones nunca desaparecen.
  3. Resolución TOLERANTE de nombres de pin (pin1 ↔ terminal_a ↔ anodo ↔ 1).
  4. Un net = un strip = todos sus pines en la misma fila (sin cables internos);
     los cables solo conectan strips a los rieles de poder.

Nomenclatura de coordenadas: la que espera el frontend (coordPlanner):
  - `fila`   = número de columna física del protoboard (1..MAX_FILA).
  - `columna`= letra del strip ('a'..'e' izq, 'f'..'j' der) o riel ('+' / '-').
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


def _fuente_pines_a_riel(componentes: list[dict], nets: list[dict]) -> dict:
    """Mapa (comp_id, pin) → '+' / '-' para los pines de las fuentes."""
    fuente_map = {}
    for c in componentes:
        if es_fuente(c):
            for p in c.get("pines", []):
                fuente_map[(c["id"], p.get("nombre", ""))] = "+" if es_pin_positivo(p) else "-"
    return fuente_map


def generar_instrucciones(netlist: dict) -> tuple[list[dict], list[str]]:
    """
    Convierte un netlist en instrucciones de armado con coordenadas físicas.
    Determinístico y tolerante. Devuelve (instrucciones, avisos).
    """
    componentes = netlist.get("componentes", [])
    comp_by_id = {c["id"]: c for c in componentes}
    ids_fuente = {c["id"] for c in componentes if es_fuente(c)}

    nets, avisos = construir_nets(netlist)

    # 1) Asignar un STRIP (fila) a cada net y coordenada a cada pin no-fuente.
    coord: dict = {}          # (comp_id, pin) → {"fila", "columna"}
    cables: list[dict] = []
    fila = 2
    # Orden estable: poder primero (rieles arriba), luego señal.
    nets_ordenados = sorted(nets, key=lambda n: {"positivo": 0, "negativo": 1, "senal": 2}[n["tipo"]])

    for net in nets_ordenados:
        pines_tablero = [(cid, pin) for (cid, pin) in net["pines"] if cid not in ids_fuente]
        if not pines_tablero:
            continue
        if fila > MAX_FILA:
            avisos.append("El circuito excede las filas disponibles del protoboard; algunos nets se apilaron.")
            fila = MAX_FILA
        if len(pines_tablero) > len(COLS_IZQ):
            avisos.append(f"Un nodo tiene {len(pines_tablero)} pines (>{len(COLS_IZQ)}); se recomienda dividirlo con un puente.")
        for i, (cid, pin) in enumerate(pines_tablero):
            columna = COLS_IZQ[i % len(COLS_IZQ)]
            coord[(cid, pin)] = {"fila": fila, "columna": columna}
        # Si el net es de poder, un cable del strip al riel correspondiente.
        if net["tipo"] in ("positivo", "negativo"):
            riel = "+" if net["tipo"] == "positivo" else "-"
            color = "rojo" if net["tipo"] == "positivo" else "negro"
            col_ancla = COLS_IZQ[min(len(pines_tablero), len(COLS_IZQ) - 1)]
            cables.append({
                "color": color,
                "desde": {"fila": fila, "columna": col_ancla},
                "hasta": {"fila": fila, "columna": riel},
            })
        fila += PASO_FILA

    # 2) Instrucciones: primero la fuente (siempre visible), luego componentes, luego cables.
    instrucciones: list[dict] = []
    n = 1

    fuente_map = _fuente_pines_a_riel(componentes, nets)
    for c in componentes:
        if not es_fuente(c):
            continue
        pines_fuente = [
            {"nombre": p.get("nombre", ""), "fila": 1, "columna": fuente_map.get((c["id"], p.get("nombre", "")), "+")}
            for p in c.get("pines", [])
        ]
        instrucciones.append({
            "numero": n, "tipo": "colocar_componente",
            "componente_id": c["id"], "componente_tipo": c.get("tipo"),
            "componente_valor": c.get("valor") or None,
            "descripcion": f"Conecta la fuente {c['id']} ({c.get('valor','')}): el positivo al riel rojo (+) y el negativo al riel azul (−).",
            "pines": pines_fuente, "cable": None,
        })
        n += 1

    for c in componentes:
        if es_fuente(c):
            continue
        pines_coord = []
        for p in c.get("pines", []):
            xy = coord.get((c["id"], p.get("nombre", "")))
            if xy is None:
                continue
            pines_coord.append({"nombre": p.get("nombre", ""), "fila": xy["fila"], "columna": xy["columna"]})
        if len(pines_coord) < 2:
            avisos.append(f"{c['id']}: no tiene suficientes pines conectados para colocarlo ({len(pines_coord)}).")
            continue
        instrucciones.append({
            "numero": n, "tipo": "colocar_componente",
            "componente_id": c["id"], "componente_tipo": c.get("tipo"),
            "componente_valor": c.get("valor") or None,
            "descripcion": f"Coloca {c['id']} ({c.get('valor','')}) en el protoboard.",
            "pines": pines_coord, "cable": None,
        })
        n += 1

    for cab in cables:
        destino = "positivo (+)" if cab["color"] == "rojo" else "negativo (−)"
        instrucciones.append({
            "numero": n, "tipo": "conectar_cable",
            "componente_id": None, "componente_tipo": None, "componente_valor": None,
            "descripcion": f"Cable {cab['color']} de la fila {cab['desde']['fila']} al riel {destino}.",
            "pines": None, "cable": cab,
        })
        n += 1

    return instrucciones, avisos

"""
Validador de propuestas de armado (sin LLM).

La IA PROPONE dónde va cada pin (fila/columna) y qué cables usar — este
módulo solo verifica que esa propuesta sea físicamente correcta, comparando
la "verdad eléctrica" del netlist (agents/topologia.construir_nets) contra
la conectividad física real que resulta de la propuesta.

No decide NADA sobre el armado. Si algo está mal, devuelve mensajes de error
concretos para que la IA los lea y corrija su propia propuesta — el mismo
patrón de reintento que ya usa el extractor con el netlist.
"""
from __future__ import annotations
from agents.topologia import construir_nets, COLS_IZQ, COLS_DER, MAX_FILA


def _dsu_find(parent: dict, x):
    parent.setdefault(x, x)
    root = x
    while parent[root] != root:
        root = parent[root]
    while parent[x] != root:
        parent[x], x = root, parent[x]
    return root


def _dsu_union(parent: dict, a, b):
    ra, rb = _dsu_find(parent, a), _dsu_find(parent, b)
    if ra != rb:
        parent[ra] = rb


def fisica_de_hueco(fila, columna) -> tuple:
    """
    A qué "bus" físico pertenece un hueco (fila,columna) — sin ningún cable,
    estos son los únicos huecos que ya están conectados entre sí de fábrica:
    - un riel (+/−) recorre TODO el tablero
    - un strip (misma fila, mismo lado del canal) conecta sus 5 huecos
    """
    col = str(columna or "").strip().lower()
    if col in ("+", "-"):
        return ("riel", col)
    if col in COLS_IZQ:
        return ("strip", fila, "izq")
    if col in COLS_DER:
        return ("strip", fila, "der")
    return ("invalido", fila, col)


def validar_instrucciones(netlist: dict, instrucciones: list[dict]) -> list[str]:
    """
    Verifica una propuesta de armado contra la física real del circuito.
    Devuelve una lista de errores (vacía = propuesta válida).
    """
    errores: list[str] = []
    nets, _ = construir_nets(netlist)

    parent: dict = {}
    pin_a_hueco: dict = {}
    # Hueco físico EXACTO (fila, columna) -> qué componentes ya lo ocupan. Los
    # rieles ('+'/'-') se excluyen a propósito: en la vida real recorren toda
    # la placa y decenas de componentes distintos se conectan a ellos sin que
    # eso sea un choque físico. Un strip normal (a-e / f-j), en cambio, es UN
    # hueco por combinación fila+columna — dos componentes DISTINTOS no caben
    # ahí a la vez, aunque electricamente "sean el mismo nodo" (eso solo dice
    # que deben compartir STRIP, no el mismo hueco individual).
    ocupantes_hueco: dict = {}

    for ins in instrucciones:
        if ins.get("tipo") == "colocar_componente" and ins.get("pines"):
            cid = ins.get("componente_id")
            for p in ins["pines"]:
                fila, col = p.get("fila"), p.get("columna")
                nombre = p.get("nombre", "")
                if fila is None or col is None:
                    errores.append(f"{cid}.{nombre}: falta 'fila' o 'columna'.")
                    continue
                if col not in ("+", "-") and not (1 <= fila <= MAX_FILA):
                    errores.append(f"{cid}.{nombre}: fila {fila} fuera de rango (1-{MAX_FILA}).")
                    continue
                clave = fisica_de_hueco(fila, col)
                if clave[0] == "invalido":
                    errores.append(f"{cid}.{nombre}: columna '{col}' no es válida (usa a-e, f-j, '+' o '-').")
                    continue
                pin_a_hueco[(cid, nombre)] = clave
                _dsu_find(parent, clave)

                if str(col).strip().lower() not in ("+", "-"):
                    hueco_exacto = (fila, str(col).strip().lower())
                    ocupante_previo = ocupantes_hueco.get(hueco_exacto)
                    if ocupante_previo is not None and ocupante_previo[0] != cid:
                        errores.append(
                            f"Colisión física: {ocupante_previo[0]}.{ocupante_previo[1]} y {cid}.{nombre} "
                            f"quedaron en el MISMO hueco (fila {fila}, columna '{col}') — dos componentes "
                            f"distintos no caben en un solo hueco. Si deben compartir nodo, usa columnas "
                            f"DIFERENTES del mismo strip (ej. una en 'a', otra en 'b') o conéctalos con un cable."
                        )
                    else:
                        ocupantes_hueco[hueco_exacto] = (cid, nombre)

        elif ins.get("tipo") == "conectar_cable" and ins.get("cable"):
            cab = ins["cable"]
            desde, hasta = cab.get("desde"), cab.get("hasta")
            if not desde or not hasta:
                errores.append("Un cable no especifica 'desde' y/o 'hasta'.")
                continue
            ka = fisica_de_hueco(desde.get("fila"), desde.get("columna"))
            kb = fisica_de_hueco(hasta.get("fila"), hasta.get("columna"))
            if ka[0] == "invalido" or kb[0] == "invalido":
                errores.append(f"Cable con coordenada inválida: {desde} → {hasta}.")
                continue
            _dsu_union(parent, ka, kb)

    if errores:
        return errores  # errores de formato — no tiene sentido seguir comparando

    # ¿Cada net del netlist quedó eléctricamente unida en la propuesta?
    grupo_de_net: dict = {}
    for net in nets:
        tablero = net["pines"]
        if not tablero:
            continue
        huecos = []
        for pp in tablero:
            k = pin_a_hueco.get(pp)
            if k is None:
                errores.append(f"{pp[0]}.{pp[1]}: no aparece colocado en ninguna instrucción.")
            else:
                huecos.append((pp, k))
        if not huecos:
            continue
        raiz0 = _dsu_find(parent, huecos[0][1])
        for pp, k in huecos[1:]:
            if _dsu_find(parent, k) != raiz0:
                otro = huecos[0][0]
                errores.append(
                    f"Falta conexión: {otro[0]}.{otro[1]} y {pp[0]}.{pp[1]} deberían estar en el mismo nodo "
                    f"eléctrico pero no quedaron unidos (ponlos en el mismo strip o agrega un cable entre ellos)."
                )
        # Grupos físicos de TODOS los miembros de este net (no solo el primero)
        # — se necesita completo para detectar cortocircuitos con precisión.
        grupo_de_net[id(net)] = {_dsu_find(parent, k) for _, k in huecos}

    # ¿La fuente llegó de verdad al riel que le corresponde?
    for net in nets:
        if net["tipo"] in ("positivo", "negativo") and id(net) in grupo_de_net:
            riel_esperado = _dsu_find(parent, ("riel", "+" if net["tipo"] == "positivo" else "-"))
            if riel_esperado not in grupo_de_net[id(net)]:
                lado = "positivo (+)" if net["tipo"] == "positivo" else "negativo (−)"
                ejemplo = net["pines"][0] if net["pines"] else None
                pista = f" (ej. {ejemplo[0]}.{ejemplo[1]})" if ejemplo else ""
                errores.append(f"El nodo {lado} del circuito no está conectado al riel {lado.split()[1]}{pista}.")

    # ¿Dos nodos que DEBEN quedar separados comparten AL MENOS un grupo físico?
    # (se compara cada grupo físico contra TODOS los grupos de cada net, no
    # solo un representante — así un solo pin mal puesto ya se detecta.)
    grupo_a_nets: dict = {}
    for net in nets:
        for g in grupo_de_net.get(id(net), set()):
            grupo_a_nets.setdefault(g, []).append(net)
    reportados: set = set()
    for lista in grupo_a_nets.values():
        distintos = list({id(n): n for n in lista}.values())
        if len(distintos) > 1:
            for i in range(len(distintos)):
                for j in range(i + 1, len(distintos)):
                    clave = tuple(sorted((id(distintos[i]), id(distintos[j]))))
                    if clave in reportados:
                        continue
                    reportados.add(clave)
                    a = distintos[i]["pines"][0] if distintos[i]["pines"] else ("nodo", distintos[i]["nodos"][0])
                    b = distintos[j]["pines"][0] if distintos[j]["pines"] else ("nodo", distintos[j]["nodos"][0])
                    errores.append(
                        f"Cortocircuito: {a[0]}.{a[1]} y {b[0]}.{b[1]} son nodos distintos del circuito "
                        f"pero quedaron conectados entre sí."
                    )

    return errores

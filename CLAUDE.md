# CLAUDE.md — Contexto del proyecto Paralelo
> **Cómo usar este archivo:** Pega el contenido al inicio de cada conversación nueva con Claude Code o en un chat nuevo aquí para retomar sin perder contexto. Actualiza "Estado actual" cada vez que cierres issues.

---

## 0. Cómo trabajar conmigo (Cristopher)

- Explicar **qué se hace, por qué así y por qué no de otra forma** — siempre que haya una decisión técnica o de diseño real de por medio. No para pasos operativos obvios.
- **No rehacer trabajo ya hecho.** Razonar el contexto de forma independiente antes de preguntar.
- **No rendirse fácilmente.** Explorar todas las alternativas antes de escalar al usuario.
- **No generar archivos ni documentación** a menos que se pida explícitamente.
- **No hacer cambios no solicitados** al código.
- **No asumir ni inferir** sin verificar contra el código real.
- Respuestas en **español neutro** (no argentino ni de España).
- Responder **directo en chat** — no markdown files ni PDFs como output.
- Cuando el usuario dice **"COCHABAMBA"**: entregar commit, PR y comando para crear la rama del siguiente issue.

---

## 1. Contexto institucional

- **Desarrollador:** Cristopher Rojas (GitHub: DanteXhunter) — estudiante de CS en estancia de verano, Programa Delfín.
- **Institución anfitriona:** Universidad EAFIT, Medellín, Colombia.
- **Compañero frontend:** Diego Rojas (GitHub: DiegoRojas8509).
- **Duración:** 6 semanas. Al momento de este archivo estamos en **semana 6** (última — perfeccionando el armado de la protoboard).
- **Contactos EAFIT:** dospinap@eafit.edu.co · yejaramilm@eafit.edu.co

---

## 2. El proyecto grande — Shared Reasoning

**Título:** *Human–AI co-execution of physical tasks through adaptive guidance.*

**Objetivo macro:** Estudiar los cinco tipos de interacción humano–IA en tareas físicas complejas, buscando sinergia, adaptabilidad y mejores resultados de aprendizaje.

### Taxonomía de interacción humano–IA

| Tipo | Descripción |
|------|-------------|
| **IN-the-Loop** | Humano requerido para cada decisión. Máximo nivel de supervisión. |
| **ON-the-Loop** | IA opera; el humano supervisa e interviene cuando hace falta. |
| **OVER-the-Loop** | Humano define objetivos y restricciones; supervisión estratégica. |
| **UNDER-the-Loop** | IA guía las acciones; el humano ejecuta. |
| **ALONG-the-Loop** | Humano e IA trabajan en paralelo; asociación colaborativa. |

> **Hallazgo clave:** el tipo de interacción no se fija desde el inicio — cambia durante la sesión según el contexto, el nivel del usuario y las decisiones que toma. Es una variable dependiente, no una constante.

---

## 3. Mi proyecto concreto — Paralelo

**Qué es:** aplicación web conversacional que convierte imágenes de esquemáticos eléctricos en instrucciones paso a paso para armar circuitos en una protoboard física. El usuario sube un esquemático, el sistema lo analiza, genera instrucciones visuales interactivas y mantiene un chat donde puede hacer preguntas, proponer cambios de conexión o mover componentes físicamente.

Es el **primer módulo funcional** de Shared Reasoning. Los tipos de interacción son detectados automáticamente por el Chat Agent y registrados para análisis de investigación.

### Pipeline principal
El usuario elige DOS modelos por separado en el front (ver §7.1): uno de **VISIÓN**
(lee la imagen) y uno de **RAZÓN** (planner + chat). Pueden ser proveedores distintos.

```
Usuario sube imagen
→ Extractor Agent (LangGraph + modelo de VISIÓN elegido) → netlist JSON
→ Planner Agent (algoritmo determinista + modelo de RAZÓN elegido) → coordenadas + instrucciones
→ Endpoint /procesar (SSE) → frontend renderiza canvas y pasos

Usuario escribe en el chat (todo corre con el modelo de RAZÓN, nunca visión)
→ Chat Agent v2 → clasificador de intención (temperature=0)
→ "responder"            → Chat Agent base responde con texto
→ "modificar_netlist"    → LLM modifica netlist → Planner regenera todo
→ "modificar_posiciones" → LLM extrae override NUMÉRICO ("mueve R1 a fila 10") → algoritmo aplica → Planner regenera
→ Endpoint /chat (SSE) → frontend actualiza canvas y pasos
```

⚠️ **Deuda conocida (detalle completo en §10):** pedidos ABIERTOS de "otro armado" /
"arma diferente" (sin números concretos) NO regeneran nada — el extractor de
posiciones no encuentra overrides que sacar y el chat cae en modo "responder" (solo
texto, sin tocar canvas ni instrucciones).

---

## 4. Repositorio y flujo Git

- **Repo:** `DanteXhunter/Shared_Reasoning` (público)
- **Rama predeterminada:** `dev` — todos los PRs apuntan aquí por defecto
- **Rama de producción:** `main` — protegida, solo recibe merges desde `dev`
- **Ruta backend:** `CircuitBuilderAI/Backend/`
- **Ruta frontend:** `CircuitBuilderAI/Frontend/`

### Convenciones Git
- Prefijos: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`
- Ramas: `prefix/numero-issue-descripcion-corta`
- Un issue por rama · un PR por issue · base siempre `dev`
- Nunca push directo a `main` ni a `dev`

### Formato PR
¿Qué hace este PR?

bullet con cada cambio relevante

Issues que cierra
Closes #N
Resultado de prueba

cómo se verificó

Notas

decisiones de diseño, limitaciones, pendientes

### Comando útil para listar archivos (sin venv)
```bash
find . -name "*.py" | grep -v venv | sort
```
---

## 5. Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | FastAPI + Uvicorn, Python 3.13 |
| Agentes | LangGraph |
| Modelos | Catálogo multi-proveedor (`providers/catalogo.py`) — OpenAI, Gemini, NVIDIA NIM, Ollama local. Selector dual visión/razón en el front (ver §7.1) |
| Frontend | React + Vite + TypeScript (Diego) |
| Canvas | Konva.js + React-Konva (Diego) |
| Estilos | Tailwind CSS v4 |

---

## 6. Estructura del backend
```
CircuitBuilderAI/Backend/
├── agents/
│   ├── estado.py           # EstadoGlobal, ModoInteraccion, tipos compartidos (incluye proveedor + proveedor_razon)
│   ├── extractor_agent.py  # imagen → netlist JSON (LangGraph, usa proveedor de VISIÓN)
│   ├── planner_agent.py    # netlist → coordenadas + instrucciones (LangGraph, usa proveedor de RAZÓN)
│   ├── chat_agent.py       # Chat Agent base (#66) — responde preguntas (usa proveedor de RAZÓN)
│   └── chat_agent_v2.py    # Chat Agent extendido (#67/#68) — clasifica intención (usa proveedor de RAZÓN)
├── providers/
│   ├── base.py             # Interfaz abstracta LLMProvider
│   ├── catalogo.py         # ÚNICA fuente de verdad: qué modelos existen, roles (vision/razon), precios, límites
│   └── mllm_provider.py    # Cliente genérico OpenAI-compatible — sirve para TODOS los proveedores
├── schemas/
│   └── netlist.py          # Schema Pydantic del netlist
├── metricas.py             # Tokens, costos, límites diarios — SEPARADOS por proveedor (dict interno por clave)
├── main.py                 # FastAPI — /procesar, /analizar, /planificar, /chat, /proveedores
└── CLAUDE.md               # Este archivo
```

> `gemini_provider.py` y `nvidia_provider.py` fueron eliminados (código muerto —
> nadie los importaba; `catalogo.py` + `mllm_provider.py` cubren todos los
> proveedores). `openai_provider.py`/`OpenAIProvider` se renombraron a
> `mllm_provider.py`/`MLLMProvider` porque ya no es específico de OpenAI.

---

## 6.1 Base de datos — conexión a Supabase

**Usar siempre el "Session pooler", nunca la "Direct connection".**

- La conexión directa (`db.<ref>.supabase.co`) solo resuelve por **IPv6** desde 2024 (a menos que se pague el add-on de IPv4 de Supabase). En redes IPv4-only (ej. redes universitarias/corporativas como la de EAFIT) el host es inalcanzable.
- Síntoma si se usa la directa en una red así: `/auth/login` y `/auth/registro` responden `500`, y el frontend lo muestra como **"Failed to fetch"** (la respuesta 500 sin CORS headers hace que el navegador la bloquee, ocultando la causa real).
- El pooler (`aws-<n>-<región>.pooler.supabase.com`, puerto 5432, modo sesión) sí tiene IPv4 y funciona en cualquier red. Copiar la cadena exacta desde el dashboard (**Connect → Session pooler**) — el prefijo `aws-0` / `aws-1` es específico de cada proyecto y no es adivinable.

---

## 7. Providers LLM — estado actual (verificado 13-jul-2026)

Todo pasa por un catálogo único (`providers/catalogo.py`) — **nunca hardcodear** un
nombre de modelo fuera de ahí. Cada entrada declara `roles: ["vision", "razon"]` (o
solo uno de los dos), que decide en qué selector del front aparece. Todos los
proveedores hablan el protocolo `/v1/chat/completions` de OpenAI (solo cambia
`base_url` + `model`), así que un solo cliente (`mllm_provider.py`) sirve para todos.

| Clave en catálogo | Modelo real | Roles | Estado hoy | Por qué |
|---|---|---|---|---|
| `gemini-flash-lite-latest` | gemini-flash-lite-latest | visión+razón | ✅ Funciona | Gratis, sin billing. El más confiable del catálogo ahora mismo. |
| `gpt-4o-mini` | gpt-4o-mini | visión+razón | ✅ Funciona | Pago, estable. **OJO:** en una prueba propia leyó peor un esquemático (capacitor mal ubicado) que el gemini gratis — no asumir "pago = mejor visión" sin medir. |
| `o3-mini` | o3-mini | solo razón | ✅ Funciona | No ve imágenes. Rechaza `temperature` — manejado en `catalogo.acepta_temperature()`. |
| `gemini-flash-latest` | gemini-flash-latest | visión+razón | ❌ 503 saturado | Google reporta "high demand". Probablemente alias apuntando al mismo modelo saturado que 3.5-flash. |
| `gemini-3.5-flash` | gemini-3.5-flash | visión+razón | ❌ 503 saturado | Lanzado 19-may-2026 — demanda de estreno lo satura. |
| `gemini-3.1-pro` (clave) | gemini-3.1-pro-preview | visión+razón | ❌ 503/timeout saturado | El nombre real de la API lleva sufijo `-preview` (sin él da 404 — ya corregido en el catálogo). Saturado igual. |
| `nemotron`, `llama-vision` | NVIDIA NIM | razón / visión | ⚠️ No reprobado hoy | Descartados originalmente por latencia (~60-70s). No se volvieron a medir en esta sesión. |
| `ollama` | configurable (`OLLAMA_MODEL`) | visión | ⚠️ Vivo pero no viable | Ver §7.2 — probado con qwen2.5vl: 48.5s/imagen + JSON inválido en el primer intento. |

**Modelos de Google BLOQUEADOS para API keys nuevas (no es saturación, es política):**
`gemini-2.5-flash` y `gemini-2.5-pro` dan **404** con *"is no longer available to new
users"*. No es un nombre mal escrito — Google no deja usar esa generación a cuentas
nuevas. No perder tiempo "arreglando" el nombre de estos dos.

**Principio clave (sigue vigente):** specs en papel ≠ realidad bajo carga compartida.
Probar con una llamada real antes de confiar en un modelo — el listado de
`/v1beta/models` puede mostrar `generateContent: true` para un modelo que igual da 404
en la llamada real (nos pasó dos veces).

### 7.1 Arquitectura de dos slots: visión y razón

Dos tareas muy distintas comparten el pipeline pero NO comparten modelo por default:
- **Visión** (`proveedor`): el extractor lee la imagen del esquemático.
- **Razón** (`proveedor_razon`): el planner (dónde va cada componente) + las 3 tareas
  internas del chat (clasificar intención, modificar netlist, modificar posiciones,
  responder). Es texto→JSON, nunca ve una imagen.

El front tiene DOS `SelectorModelo` independientes (cada uno filtra el catálogo por
`roles.includes('vision' | 'razon')`), y `Sesion` guarda `proveedor` +
`proveedorRazon` por separado. Si `proveedor_razon` no se manda (retrocompatibilidad),
el backend cae al mismo valor de `proveedor`.

`GET /proveedores` expone el catálogo agrupado por categoría (pago/free/local) con
`roles`, `disponible` (si hay API key) y costo/cuota — es la única fuente que debe
consultar el front. Nunca hardcodear la lista de modelos ahí.

### 7.2 Ollama (modelo local)

Instalado y funcional en la Mac de desarrollo (M4, 16GB): `ollama serve` +
`ollama pull qwen2.5vl`. Prueba real contra el esquemático de prueba del proyecto:
**48.5 segundos** de latencia y **JSON inválido** en el primer intento (error de
escape). Mismo veredicto que NVIDIA NIM en su momento: descalificante para uso
interactivo. Queda como respaldo técnico, no como opción viable para la entrega.

Importante para el despliegue: Ollama corre en la máquina que aloja el **backend**, no
en el dispositivo de cada usuario final (la app es web — el usuario solo usa un
navegador). Si algún día se despliega con Ollama como opción real, es una decisión de
infraestructura del servidor, no algo que cada usuario configura.

### Agregar un nuevo proveedor
1. Agregar una entrada en `providers/catalogo.py` (`CATALOGO`): `model`, `api_key_env`,
   `base_url`, `categoria`, `etiqueta`, `descripcion`, `roles`.
2. Agregar límites/costo en `metricas.py` (`LIMITES`) con la **misma clave** — si no
   coinciden, el modelo queda `tipo_facturacion: "desconocido"` y no acumula costo.
3. Agregar la API key en `.env`.
4. Verificar con una llamada real antes de confiar en el catálogo (ver "Principio
   clave" arriba).

Todos los proveedores usan `MLLMProvider` (antes `OpenAIProvider`) — no crear una clase
nueva salvo que el proveedor NO hable el protocolo OpenAI-compatible.

---

## 8. Schema del netlist

```json
{
    "componentes": [
        {
            "id": "R1",
            "tipo": "resistencia",
            "valor": "10k",
            "unidad": "ohm",
            "propiedades": {"potencia_nominal": "0.25W", "tolerancia": "5%"},
            "pines": [
                {"nombre": "pin1", "funcion": "terminal_a"},
                {"nombre": "pin2", "funcion": "terminal_b"}
            ]
        }
    ],
    "conexiones": [
        {"de": "R1.pin1", "a": "VCC", "descripcion": "conexión a alimentación"}
    ]
}
```

---

## 9. Protoboard — reglas físicas

- 830 puntos · 30 filas · columnas a–j · gap entre e y f
- Pines de componentes: columnas b y g (cruzan el gap)
- Colores de cable: rojo = VCC · negro = GND · amarillo = inter-componente
- `fila 0` con `columna "+"` o `"-"` = rieles de poder
- Posicionamiento: cada componente ocupa una fila · separación de una fila entre componentes

**⚠️ El posicionamiento YA NO es determinista — esta sección estaba desactualizada.**
`calcular_posiciones` no existe más. Hoy el LLM **propone** dónde va cada componente y
qué cables usar (`planner_agent.py`, `PROMPT_PLANIFICAR`); `agents/validador.py`
verifica la propuesta contra la física real (`agents/topologia.py` calcula qué pines
DEBEN quedar conectados) y rebota errores concretos para que el LLM se corrija — hasta
`MAX_REINTENTOS` veces. Relevante para el bug de §10: pedir "otro armado" es
técnicamente posible porque el LLM ya decide la geometría libremente — el problema es
que el chat no vuelve a invocar ese camino cuando el pedido es abierto.

---

## 10. Chat Agent — decisiones de diseño

- **Clasificador de intención a temperature=0:** para consistencia en la categorización — `responder`, `modificar_netlist`, `modificar_posiciones`.
- **Modificar posición ≠ modificar netlist:** mover un componente físicamente no cambia la topología eléctrica. El netlist queda intacto; solo se recalculan coordenadas y cables con override.
- **Override de posición:** el LLM extrae `{componente_id, fila_nueva}` del mensaje. Ese override se le pasa al **planner como restricción a respetar** (no lo aplica un algoritmo fijo — ver corrección en §9); si no es eléctricamente posible, el planner explica y usa la alternativa más cercana, y `validador.py` garantiza la física.
- **Validación de colisiones pendiente:** el sistema no verifica aún si dos componentes colisionan en la misma fila al aplicar un override. Deuda técnica conocida.
- **`chat_agent_v2.py` en vez de modificar `chat_agent.py`:** el #66 ya estaba mergeado. Tocar ese archivo en otra rama genera conflictos innecesarios.
- **Se accede a `proveedor.client` directamente:** el método `chat()` del provider no soporta system prompt ni contexto de circuito. Evita modificar la interfaz base que comparten todos los providers.

### 🔴 Bug activo — pedidos ABIERTOS de rearmado no regeneran nada (en implementación: Diego — rama `feat/planner-scaffold-netgraph`)

**Síntoma:** el usuario pide algo como *"propón otro armado"* o *"arma diferente"* SIN
dar números concretos (a diferencia de *"mueve R1 a la fila 10"*, que sí funciona). El
chat responde con texto descriptivo bien redactado (a veces hasta con un diagrama en
ASCII) pero **nunca actualiza el netlist, las instrucciones ni el protoboard** en el
front.

**Causa exacta, paso a paso:**
1. El clasificador etiqueta el mensaje como `modificar_posiciones` (es razonable — el
   usuario quiere mover componentes, no cambiar la topología eléctrica).
2. `_aplicar_modificacion_posiciones()` (`agents/chat_agent_v2.py`) le pide al LLM que
   extraiga `{componente_id: fila}` del mensaje — pero como el usuario no mencionó
   ninguna fila, el LLM devuelve `overrides: {}` (vacío).
3. En `ejecutar_chat_agent_v2()`, cuando `overrides` viene vacío, el código cae aquí:
   ```python
   if not overrides:
       resultado = await ejecutar_chat_agent(estado)  # ← solo responde texto
       resultado["intencion_detectada"] = intencion
       return resultado
   ```
   Nunca se vuelve a llamar al planner. `instrucciones_actualizadas` nunca se manda al
   front, así que `ChatPanel.onInstruccionesActualizadas` nunca se dispara y el
   protoboard/pasos se quedan exactamente como estaban.

**Direcciones evaluadas (decisión tomada abajo):**
- **(a)** Cuando `overrides` viene vacío pero la intención es `modificar_posiciones`,
  en vez de caer a "responder", volver a llamar al planner pidiéndole una
  distribución **alternativa** (pasarle las instrucciones anteriores como contexto de
  "qué NO repetir"). Reutiliza toda la validación física que el planner ya tiene.
- **(b)** Agregar una intención nueva (ej. `proponer_alternativa`), separada de
  `modificar_posiciones`, para no forzar al extractor de overrides numéricos a cubrir
  un caso que no es el suyo — el clasificador tendría que distinguir "dame una fila
  específica" de "dame cualquier distribución distinta a la actual".
- Cualquiera de las dos debe seguir devolviendo `instrucciones_actualizadas` en la
  respuesta — ese contrato ya funciona bien hoy para `modificar_netlist` y
  `modificar_posiciones` con números explícitos, no hay que tocarlo.

**✅ Decisión (2026-07-15, Diego — rama `feat/planner-scaffold-netgraph`): opción (b) + refinamiento net-graph.**
- Se agrega la intención **`proponer_alternativa`**, separada de `modificar_posiciones`,
  para que el clasificador distinga "mueve R1 a la fila 10" (override numérico) de
  "arma diferente / propón otro armado" (distribución alternativa). Evita sobrecargar el
  extractor de overrides numéricos con un caso que no es el suyo.
- **Refinamiento (idea de Diego):** el planner recibirá el **net-graph explícito** de
  `agents/topologia.construir_nets()` (los nodos eléctricos ya agrupados) como base de
  razonamiento, en vez de re-deducir la topología desde el netlist plano. Hoy ese grafo
  solo se usa como juez en `validador.py`; pasarlo TAMBIÉN al planner lo vuelve el
  cimiento del armado (menos errores) y el mismo grafo persistente sirve para validar
  propuestas del usuario ("¿esto es eléctricamente posible?") sin recalcularlo.
- La ruta nueva respeta el contrato existente: devuelve `instrucciones_actualizadas`
  para que el front actualice canvas y pasos.

**Cómo reproducirlo:** subir cualquier esquemático, dejar que arme normal, y en el chat
escribir *"propón otro armado y renderiza los pasos"* (sin mencionar filas). Comparar
contra *"mueve R1 a la fila 10"*, que sí actualiza todo correctamente.

---

## 11. Issues completados

| Issue | Descripción | Rama |
|-------|-------------|------|
| #65 | Renombrar proyecto a Paralelo | `chore/65-renombrar-paralelo` |
| #66 | Chat Agent base — responder preguntas | `feat/66-chat-agent-base` |
| #67 | Chat Agent — modificación de netlist | `feat/67-chat-agent-modificacion-netlist` |
| #68 | Chat Agent — modificación de posiciones | `feat/68-chat-agent-modificacion-posiciones` |

---

## 12. Issues pendientes

**Semana 4 — Backend:**
- #69 — Endpoint `/chat` con SSE
- #70 — Base de datos y modelos (SQLite dev, PostgreSQL prod)
- #71 — Registro y autenticación de usuarios (JWT)
- #72 — Cuestionario de scaffolding (nivel principiante/intermedio/avanzado)
- #73 — Persistencia de sesiones e historial de chat
- #74 — Hashear contraseñas con bcrypt
- #75 — JWT con manejo seguro de secretos
- #76 — Rate limiting en endpoints públicos
- #77 — Sanitizar inputs contra prompt injection
- #78 — Restringir CORS a dominios de producción
- #79 — Migrar queries a SQLAlchemy
- #80 — Auditoría de logs
- #81 — HTTPS obligatorio en despliegue
- #82 — Detección automática de tipo de interacción

**Semana 5 — Frontend (Diego):** #83–#93
**Semana 5 — Pruebas y métricas:** #94–#97
**Semana 6 — Entrega:** #98–#103 (documentación, video, presentación, despliegue)

---

## 13. Comandos frecuentes

```bash
# Correr el backend
cd CircuitBuilderAI/Backend
source venv/bin/activate
uvicorn main:app --reload

# Ver issues abiertos con descripción completa
gh issue list --repo DanteXhunter/Shared_Reasoning --limit 100 --state open --json number,title,body,labels | cat

# Listar archivos Python del proyecto (sin venv)
find . -name "*.py" | grep -v venv | sort

# Crear rama para un issue nuevo
git checkout dev
git pull origin dev
git checkout -b prefix/numero-descripcion
```


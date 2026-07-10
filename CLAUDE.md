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
- **Duración:** 6 semanas. Al momento de este archivo estamos en **semana 4**.
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
Usuario sube imagen
→ Extractor Agent (LangGraph + gpt-4o-mini) → netlist JSON
→ Planner Agent (algoritmo determinista + LLM) → coordenadas + instrucciones
→ Endpoint /procesar (SSE) → frontend renderiza canvas y pasos
Usuario escribe en el chat
→ Chat Agent v2 → clasificador de intención (temperature=0)
→ "responder"            → Chat Agent base responde con texto
→ "modificar_netlist"    → LLM modifica netlist → Planner regenera todo
→ "modificar_posiciones" → LLM extrae override → algoritmo aplica → Planner regenera
→ Endpoint /chat (SSE) → frontend actualiza canvas y pasos

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
| Modelo activo | OpenAI gpt-4o-mini |
| Frontend | React + Vite + TypeScript (Diego) |
| Canvas | Konva.js + React-Konva (Diego) |
| Estilos | Tailwind CSS v4 |

---

## 6. Estructura del backend
CircuitBuilderAI/Backend/
├── agents/
│   ├── estado.py           # EstadoGlobal, ModoInteraccion, tipos compartidos
│   ├── extractor_agent.py  # imagen → netlist JSON (LangGraph)
│   ├── planner_agent.py    # netlist → coordenadas + instrucciones (LangGraph)
│   ├── chat_agent.py       # Chat Agent base (#66) — responde preguntas
│   └── chat_agent_v2.py    # Chat Agent extendido (#67/#68) — clasifica intención
├── providers/
│   ├── base.py             # Interfaz abstracta LLMProvider
│   ├── openai_provider.py  # gpt-4o-mini (proveedor activo)
│   ├── gemini_provider.py  # descartado en producción
│   └── nvidia_provider.py  # descartado por latencia
├── schemas/
│   └── netlist.py          # Schema Pydantic del netlist
├── metricas.py             # Tokens, costos, límites diarios por proveedor
├── main.py                 # FastAPI — /procesar, /analizar, /planificar
└── CLAUDE.md               # Este archivo

---

## 6.1 Base de datos — conexión a Supabase

**Usar siempre el "Session pooler", nunca la "Direct connection".**

- La conexión directa (`db.<ref>.supabase.co`) solo resuelve por **IPv6** desde 2024 (a menos que se pague el add-on de IPv4 de Supabase). En redes IPv4-only (ej. redes universitarias/corporativas como la de EAFIT) el host es inalcanzable.
- Síntoma si se usa la directa en una red así: `/auth/login` y `/auth/registro` responden `500`, y el frontend lo muestra como **"Failed to fetch"** (la respuesta 500 sin CORS headers hace que el navegador la bloquee, ocultando la causa real).
- El pooler (`aws-<n>-<región>.pooler.supabase.com`, puerto 5432, modo sesión) sí tiene IPv4 y funciona en cualquier red. Copiar la cadena exacta desde el dashboard (**Connect → Session pooler**) — el prefijo `aws-0` / `aws-1` es específico de cada proyecto y no es adivinable.

---

## 7. Providers LLM — estado actual

| Provider | Modelo | Estado | Razón |
|----------|--------|--------|-------|
| OpenAI | gpt-4o-mini | ✅ Activo | Rápido, confiable, bajo costo |
| Gemini 2.5 Flash-Lite | free tier | ❌ Descartado | Throttling severo — una sola petición útil por sesión |
| NVIDIA NIM Nemotron | nemotron-3-nano | ❌ Descartado | +70s de latencia en tier gratuito |
| NVIDIA NIM Llama | llama-3.2-11b-vision | ❌ Descartado | ~60s de latencia, inaceptable |

**Principio clave:** specs en papel ≠ realidad bajo carga compartida. Todo proveedor nuevo debe pasar prueba empírica antes de adoptarse.

### Agregar un nuevo proveedor
1. Crear `providers/nuevo_provider.py` heredando de `LLMProvider`
2. Implementar `analizar_esquematico`, `generar_instrucciones`, `chat`
3. Agregar en `main.py`
4. Agregar límites en `metricas.py`
5. Agregar API key en `.env`

Si es compatible con OpenAI (`/v1/chat/completions`), reutilizar `OpenAIProvider` cambiando solo `base_url` y nombre del modelo.

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
- **El posicionamiento es determinista, no LLM.** `calcular_posiciones` en `planner_agent.py` asigna coordenadas con algoritmo fijo. El LLM solo genera instrucciones en lenguaje natural.

---

## 10. Chat Agent — decisiones de diseño

- **Clasificador de intención a temperature=0:** para consistencia en la categorización — `responder`, `modificar_netlist`, `modificar_posiciones`.
- **Modificar posición ≠ modificar netlist:** mover un componente físicamente no cambia la topología eléctrica. El netlist queda intacto; solo se recalculan coordenadas y cables con override.
- **Override de posición:** el LLM extrae `{componente_id, fila_nueva}` del mensaje del usuario. El algoritmo determinista aplica ese override — no el LLM. Esto mantiene la garantía física del protoboard.
- **Validación de colisiones pendiente:** el sistema no verifica aún si dos componentes colisionan en la misma fila al aplicar un override. Deuda técnica conocida.
- **`chat_agent_v2.py` en vez de modificar `chat_agent.py`:** el #66 ya estaba mergeado. Tocar ese archivo en otra rama genera conflictos innecesarios.
- **Se accede a `proveedor.client` directamente:** el método `chat()` del provider no soporta system prompt ni contexto de circuito. Evita modificar la interfaz base que comparten todos los providers.

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


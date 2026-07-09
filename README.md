# Paralelo

### Human–AI co-execution of physical tasks through adaptive guidance

**Programa Delfín · Universidad EAFIT · 2026**

---

## ¿Qué es Paralelo?

**Paralelo** es una aplicación web conversacional que convierte imágenes de esquemáticos eléctricos en instrucciones paso a paso para armar circuitos en una protoboard física.

El usuario sube la foto de un diagrama, el sistema identifica los componentes y su topología, genera instrucciones visuales interactivas sobre un canvas de la protoboard, y mantiene un **chat** donde el usuario puede hacer preguntas, proponer cambios de conexión o mover componentes — con el circuito actualizándose en tiempo real.

Es el **primer módulo funcional** del proyecto de investigación **Shared Reasoning**, que estudia la co-ejecución de tareas físicas complejas entre humanos e inteligencia artificial.

> El repo también contiene `VisionArtificial/`, un track paralelo de investigación en visión por computadora (detección de componentes con OpenCV), en etapa más temprana.

---

## Propuesta de valor

A diferencia de un tutorial estático, Paralelo **adapta su guía** al usuario y registra **cómo** colabora la persona con la IA. El proyecto estudia los cinco tipos de interacción humano–IA en tareas físicas:

| Tipo | Descripción |
|------|-------------|
| **IN-the-Loop** | El humano decide en cada paso; máxima supervisión. |
| **ON-the-Loop** | La IA opera; el humano supervisa e interviene. |
| **OVER-the-Loop** | El humano define objetivos; supervisión estratégica. |
| **UNDER-the-Loop** | La IA guía; el humano ejecuta. |
| **ALONG-the-Loop** | Humano e IA trabajan en paralelo, en asociación. |

El tipo de interacción **no es fijo**: cambia durante la sesión según el nivel del usuario y sus decisiones. Además, las instrucciones se redactan según el nivel autoreportado (**básico / intermedio / experto**), explicando más o menos según haga falta.

---

## Cómo funciona

**Pipeline de generación del circuito:**

```
Imagen del esquemático
  → Extractor Agent (gpt-4o-mini)            → netlist JSON (componentes + conexiones)
  → Topología determinística + Planner       → coordenadas físicas de protoboard (0 tokens, correcto por construcción)
  → Capa de verbosidad (según nivel)         → reescribe el texto de cada paso
  → Instrucciones interactivas en el canvas
```

**Chat Agent (v2):** cada mensaje pasa por un clasificador de intención (`temperature=0`) que decide:

- **responder** → responde la pregunta sobre el circuito.
- **modificar_netlist** → cambia una conexión eléctrica y regenera todo el plan.
- **modificar_posiciones** → mueve un componente en la protoboard (sin cambiar la topología eléctrica) y regenera las coordenadas.

**Cuentas y datos:** registro/login con JWT + Argon2, sesiones persistentes (netlist, instrucciones, historial de chat, métricas) por usuario, y *rate limiting* por usuario/IP para proteger el presupuesto de tokens y el servidor.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Modelo multimodal | **OpenAI gpt-4o-mini** (proveedor activo) |
| Abstracción de proveedores | OpenAI · Gemini · NVIDIA (intercambiables) |
| Framework de agentes | LangGraph |
| Backend | FastAPI + Uvicorn (Python 3.13) |
| Base de datos | PostgreSQL (Supabase) vía SQLAlchemy + Alembic |
| Autenticación | JWT (PyJWT) + hashing Argon2 |
| Frontend | React 19 + Vite + TypeScript |
| Canvas interactivo | Konva.js + React-Konva |
| Estilos | Tailwind CSS v4 |

---

## Estructura del proyecto

```
CircuitBuilderAI/
├── Backend/
│   ├── agents/          # extractor, planner, topología, verbosidad, chat_agent_v2, seguridad
│   ├── providers/       # abstracción LLM (openai activo; gemini/nvidia)
│   ├── db/              # database.py + models.py (SQLAlchemy)
│   ├── alembic/         # migraciones del esquema de la base de datos
│   ├── schemas/         # schema Pydantic del netlist
│   ├── auth.py          # JWT + Argon2
│   ├── rate_limit.py    # límites por usuario/IP y presupuesto de tokens
│   ├── metricas.py      # tokens, costos y cuotas por proveedor
│   └── main.py          # aplicación FastAPI (endpoints)
└── Frontend/
    └── src/
        ├── api/         # clientes HTTP: auth, analizar, planificar, chat
        ├── ui/          # pantallas: Auth, EncuestaNivel, Bienvenida, VistaPrincipal, ChatPanel
        ├── circuit/     # lógica de layout de la protoboard
        └── components/  # Protoboard (Konva) y galería de componentes
```

---

## Requisitos previos

- **Python 3.13**
- **Node.js 20+** (para Vite)
- Una **API key de OpenAI** — <https://platform.openai.com/api-keys>
- Una base de datos **PostgreSQL**. Lo más simple: una cuenta gratuita de **Supabase** (<https://supabase.com>), que provee la connection string.

---

## Instalación y ejecución

### Backend

```bash
cd CircuitBuilderAI/Backend

# 1. Entorno virtual
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 2. Dependencias
pip install -r requirements.txt

# 3. Variables de entorno (ver sección siguiente)
cp .env.example .env            # luego rellena el .env

# 4. Crear las tablas en la base de datos
alembic upgrade head

# 5. Correr el servidor
uvicorn main:app --reload
```

El backend queda en <http://localhost:8000>. La documentación interactiva de la API está en <http://localhost:8000/docs>.

### Frontend

```bash
cd CircuitBuilderAI/Frontend

# 1. Dependencias
npm install

# 2. Variables de entorno
cp .env.example .env            # apunta al backend (por defecto localhost:8000)

# 3. Correr en modo desarrollo
npm run dev
```

El frontend queda en <http://localhost:5173>.

---

## Variables de entorno

### Backend — `CircuitBuilderAI/Backend/.env`

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `PROVIDER_ACTIVO` | Sí | Proveedor por defecto (`openai`). |
| `OPENAI_API_KEY` | Sí | Clave del proveedor activo. |
| `DATABASE_URL` | Sí | Connection string de PostgreSQL/Supabase (URI). |
| `JWT_SECRET_KEY` | Sí | Secreto para firmar los tokens (ver abajo). |
| `JWT_EXPIRA_MINUTOS` | No | Vida del token en minutos (por defecto `10080` = 7 días). |
| `GEMINI_API_KEY` · `NVIDIA_API_KEY` | No | Solo si activas esos proveedores. |

Genera un `JWT_SECRET_KEY` seguro con:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

> El archivo `.env` **nunca** se sube a Git — contiene secretos.

### Frontend — `CircuitBuilderAI/Frontend/.env`

| Variable | Descripción |
|----------|-------------|
| `VITE_API_URL` | URL del backend (por defecto `http://localhost:8000`). |

> En Vite, las variables **deben** empezar con `VITE_` y quedan **expuestas** en el navegador. Nunca pongas secretos aquí.

---

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/registro` · `/auth/login` | Crear cuenta / iniciar sesión (devuelven JWT). |
| `GET` | `/auth/me` | Datos del usuario autenticado (restaura sesión). |
| `PATCH` | `/auth/nivel` | Guardar el nivel elegido en la encuesta. |
| `POST` | `/analizar` | Imagen → netlist. |
| `POST` | `/planificar` | Netlist → instrucciones. |
| `POST` | `/procesar` | Imagen → instrucciones completas (streaming SSE). |
| `POST` | `/chat` | Chat sobre el circuito (streaming SSE). |
| `POST` `GET` | `/sesiones` · `/sesiones/{id}` | Crear, listar y retomar sesiones guardadas. |

Todos los endpoints (excepto registro/login) requieren un token JWT en el header `Authorization: Bearer <token>`.

---

## Equipo

| Nombre | Rol |
|--------|-----|
| Cristopher Rojas ([DanteXhunter](https://github.com/DanteXhunter)) | Backend · agentes — Programa Delfín |
| Diego Rojas ([DiegoRojas8509](https://github.com/DiegoRojas8509)) | Frontend · canvas — Programa Delfín |

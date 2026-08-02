# Paralelo

### Human–AI co-execution of physical tasks through adaptive guidance

**Programa Delfín · Universidad EAFIT · 2026**

---

## ¿Qué es Paralelo?

**Paralelo** es una aplicación web conversacional que convierte imágenes de esquemáticos eléctricos en instrucciones paso a paso para armar circuitos en una protoboard física.

El usuario sube la foto de un diagrama, el sistema identifica los componentes y su topología, genera instrucciones visuales interactivas sobre un canvas de la protoboard, y mantiene un **chat** donde el usuario puede hacer preguntas, proponer cambios de conexión o mover componentes — con el circuito actualizándose en tiempo real.

Es el **primer módulo funcional** del proyecto de investigación **Shared Reasoning**, que estudia la co-ejecución de tareas físicas complejas entre humanos e inteligencia artificial.

> El repo también contiene `VisionArtificial/`, un track de otro equipo (detección de componentes con OpenCV), independiente de Paralelo.

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

El tipo de interacción **no es fijo**: se **diagnostica en cada turno** (al planificar y en cada mensaje del chat) y cambia durante la sesión según el nivel del usuario y sus decisiones. Ese diagnóstico se registra por mensaje para el análisis de investigación. Las instrucciones, además, se redactan según el nivel autoreportado en la encuesta (**básico / experto**; el nivel *intermedio* sigue soportado en el backend pero está oculto en la UI).

---

## Cómo funciona

### Dos modelos, no uno

El pipeline separa dos tareas que **no comparten modelo**. El usuario elige cada uno en su propio selector en el frontend:

- **Visión** (`proveedor`): lee la imagen del esquemático.
- **Razón** (`proveedor_razon`): planifica el armado y opera las tareas del chat. Es texto→JSON, nunca ve una imagen.

Ambos salen del mismo catálogo multi-proveedor (`providers/catalogo.py`, única fuente de verdad). Cada modelo declara sus `roles` (`vision`, `razon` o ambos), que deciden en qué selector aparece.

### Pipeline de generación del circuito

```
Imagen del esquemático
  → Extractor Agent (modelo de VISIÓN)   → netlist JSON (componentes + conexiones)
  → topologia.py (union-find, sin IA)    → resuelve qué pines DEBEN conectarse (nets)
  → Planner Agent (modelo de RAZÓN)      → propone geometría (fila/columna/cables) + texto de cada paso
  → validador.py                         → simula la física y rebota errores al planner (reintento)
  → Instrucciones interactivas en el canvas
```

El posicionamiento **no es determinista**: el LLM *propone* dónde va cada componente y qué cables usar; `validador.py` verifica esa propuesta contra los nets reales (cortocircuitos, colisiones en el mismo hueco, rieles no conectados, nodos sin unir) y reinyecta los errores concretos en el prompt para que el modelo se corrija, hasta un máximo de reintentos.

### Chat Agent (v2)

Cada mensaje pasa por el modelo de razón usando **function-calling** (`tool_choice="required"`): el modelo **siempre** elige una de cuatro acciones, y de paso diagnostica el tipo de interacción en la misma llamada:

- **responder** → responde la pregunta sobre el circuito (solo texto).
- **modificar_netlist** → agrega/quita/reconecta un componente y **regenera todo el plan**.
- **modificar_posiciones** → mueve un componente (sin cambiar la topología eléctrica) vía un override numérico o una instrucción libre, y regenera las coordenadas.
- **proponer_alternativa** → pide al planner una distribución **distinta** a la actual (pedidos abiertos tipo "arma diferente").

Todas las rutas que tocan el circuito devuelven `instrucciones_actualizadas` para que el frontend refresque canvas y pasos en tiempo real.

### Cuentas y datos

Registro/login con JWT + Argon2, sesiones persistentes por usuario (netlist, instrucciones, imagen, historial de chat, métricas), sesiones **compartibles** por token, y *rate limiting* por usuario/IP para proteger el presupuesto de tokens y el servidor.

---

## Modelos y API keys

Por defecto, el despliegue usa las **API keys propias del proyecto Paralelo** (configuradas en el `.env` del backend), de modo que cualquier usuario puede probar la app sin traer credenciales.

Además, cada usuario puede **agregar sus propias API keys con crédito** desde *Mi cuenta → API keys*, para acceder a modelos de pago (GPT-4o mini, o3-mini, Gemini Pro, etc.). Esas keys se guardan **cifradas** en la base de datos (Fernet, con la llave `API_KEYS_SECRET`) — nunca en texto plano, y no hay backdoor si se pierde la llave.

`GET /proveedores` expone el catálogo agrupado por categoría (pago / gratis / local) con roles, disponibilidad y costo — es la única fuente que consulta el frontend para armar sus selectores.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Modelos | Catálogo multi-proveedor: **OpenAI · Google Gemini · NVIDIA NIM · Ollama** (local). Un solo cliente OpenAI-compatible (`MLLMProvider`) sirve a todos. |
| Framework de agentes | LangGraph |
| Backend | FastAPI + Uvicorn (Python 3.13) |
| Base de datos | PostgreSQL (Supabase, *Session pooler*) vía SQLAlchemy + Alembic |
| Autenticación | JWT (PyJWT) + hashing Argon2 |
| Cifrado de keys | Fernet (`cryptography`) |
| Frontend | React 19 + Vite + TypeScript |
| Canvas interactivo | Konva.js + React-Konva |
| Estilos | Tailwind CSS v4 |

---

## Estructura del proyecto

```
CircuitBuilderAI/
├── Backend/
│   ├── agents/
│   │   ├── estado.py                  # EstadoGlobal + enum ModoInteraccion (los 5 tipos)
│   │   ├── extractor_agent.py         # imagen → netlist (grafo LangGraph, modelo de visión)
│   │   ├── topologia.py               # union-find: qué pines DEBEN conectarse (sin IA)
│   │   ├── planner_agent.py           # netlist + nets → geometría + texto de cada paso (modelo de razón)
│   │   ├── validador.py               # simula la física y rebota errores al planner
│   │   ├── agent_chat.py              # responde preguntas ("responder")
│   │   ├── chat_agent_v2.py           # orquestador del chat (elige y ejecuta la acción)
│   │   ├── herramientas_chat.py       # las 4 acciones en formato function-calling
│   │   ├── deteccion_interaccion.py   # diagnostica el tipo de interacción por turno
│   │   ├── verbosidad.py              # reglas de redacción por nivel del usuario
│   │   └── seguridad.py               # sanitiza/delimita input (mitigación de prompt injection)
│   ├── providers/
│   │   ├── catalogo.py                # única fuente de verdad de modelos y roles
│   │   ├── base.py · mllm_provider.py # interfaz + cliente OpenAI-compatible único
│   │   ├── disponibilidad_usuario.py  # qué modelos puede usar la key del usuario
│   │   └── cifrado_keys.py            # Fernet para las API keys guardadas
│   ├── db/                            # database.py + models.py (Usuario, Sesion, ChatMensaje)
│   ├── alembic/                       # migraciones del esquema
│   ├── schemas/netlist.py             # schema Pydantic del netlist
│   ├── auth.py                        # JWT + Argon2
│   ├── rate_limit.py                  # límites por usuario/IP (en memoria del proceso)
│   ├── metricas.py                    # tokens, costos y cuotas por proveedor
│   ├── biblioteca_esquematicos.py     # esquemáticos de ejemplo (Supabase Storage)
│   └── main.py                        # aplicación FastAPI (endpoints)
└── Frontend/
    └── src/
        ├── api/          # clientes HTTP: auth, analizar, planificar, chat, sesiones, proveedores
        ├── ui/           # pantallas: Auth, EncuestaNivel, VistaPrincipal, ChatPanel, SelectorModelo (×2), etc.
        ├── circuit/      # layout de la protoboard + código de colores de resistencias
        └── components/   # Protoboard (Konva), vistas de instrucciones/JSON, galería de componentes
```

---

## Requisitos previos

- **Python 3.13**
- **Node.js 20+** (para Vite)
- Al menos una **API key** de un proveedor (OpenAI, Gemini o NVIDIA). Gemini tiene tier gratuito: <https://aistudio.google.com/app/apikey>
- Una base de datos **PostgreSQL**. Lo más simple: cuenta gratuita de **Supabase** (<https://supabase.com>) — usar siempre la connection string del **Session pooler** (ver nota en el `.env.example`).

---

## Instalación y ejecución (local)

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

El backend queda en <http://localhost:8000>. La documentación interactiva está en <http://localhost:8000/docs>.

### Frontend

```bash
cd CircuitBuilderAI/Frontend

npm install
cp .env.example .env            # VITE_API_URL apunta al backend (por defecto localhost:8000)
npm run dev
```

El frontend queda en <http://localhost:5173>.

---

## Variables de entorno

### Backend — `CircuitBuilderAI/Backend/.env`

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `OPENAI_API_KEY` · `GEMINI_API_KEY` · `NVIDIA_API_KEY` | Al menos una | Claves de los proveedores del catálogo. |
| `DATABASE_URL` | Sí | Connection string de PostgreSQL/Supabase (**Session pooler**, no la directa). |
| `JWT_SECRET_KEY` | Sí | Secreto para firmar los tokens (ver abajo). |
| `API_KEYS_SECRET` | Sí | Llave Fernet que cifra las API keys que los usuarios guardan en su cuenta. |
| `JWT_EXPIRA_MINUTOS` | No | Vida del token en minutos (por defecto `10080` = 7 días). |
| `FRONTEND_URL` | Prod | Dominio del frontend desplegado para CORS. Si se omite, solo se acepta localhost. |
| `SUPABASE_URL` · `SUPABASE_ANON_KEY` | No | Solo para la biblioteca de esquemáticos de ejemplo. Sin ellas, esa vista queda vacía (no rompe la app). |
| `OLLAMA_BASE_URL` · `OLLAMA_MODEL` | No | Solo si corres un modelo local con Ollama en la misma máquina que el backend. |

Genera los secretos con:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"                              # JWT_SECRET_KEY
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" # API_KEYS_SECRET
```

> El archivo `.env` **nunca** se sube a Git — contiene secretos.

### Frontend — `CircuitBuilderAI/Frontend/.env`

| Variable | Descripción |
|----------|-------------|
| `VITE_API_URL` | URL del backend (por defecto `http://localhost:8000`). |

> En Vite, las variables **deben** empezar con `VITE_` y quedan **expuestas** en el navegador. Nunca pongas secretos aquí.

---

## Despliegue

El proyecto está desplegado:

| Componente | Plataforma | Notas |
|------------|-----------|-------|
| **Backend** (FastAPI) | **Railway** | Variables de entorno configuradas en el panel de Railway. La base de datos es la misma Supabase (Session pooler). |
| **Frontend** (Vite) | **Cloudflare Pages** | Build estático servido por Cloudflare. `VITE_API_URL` apunta a la URL pública del backend en Railway. |

Para que el backend acepte peticiones del frontend desplegado, `FRONTEND_URL` (CORS) debe apuntar al dominio de Cloudflare Pages, sin slash final.

---

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/proveedores` · `/biblioteca-esquematicos` | Catálogo de modelos · esquemáticos de ejemplo. |
| `POST` | `/auth/registro` · `/auth/login` | Crear cuenta / iniciar sesión (devuelven JWT). |
| `GET` | `/auth/me` · `/auth/modelos-disponibles` | Usuario autenticado · modelos habilitados para sus keys. |
| `PATCH` | `/auth/perfil` · `/auth/contrasena` · `/auth/api-keys` · `/auth/nivel` | Actualizar perfil, contraseña, API keys propias y nivel. |
| `POST` | `/analizar` · `/planificar` | Imagen → netlist · netlist → instrucciones. |
| `POST` | `/chat` | Chat sobre el circuito (streaming SSE). |
| `POST` `GET` `PATCH` `DELETE` | `/sesiones` · `/sesiones/{id}` | CRUD de sesiones guardadas. |
| `POST` `GET` | `/sesiones/{id}/compartir` · `/sesiones/compartidas/{token}` | Compartir e importar sesiones por token. |

Todos los endpoints (excepto registro/login y los públicos de arriba) requieren un token JWT en el header `Authorization: Bearer <token>`.

---

## Equipo

| Nombre | Rol |
|--------|-----|
| Cristopher Rojas ([DanteXhunter](https://github.com/DanteXhunter)) | Backend · agentes — Programa Delfín |
| Diego Rojas ([DiegoRojas8509](https://github.com/DiegoRojas8509)) | Frontend · canvas — Programa Delfín |

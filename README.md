# Shared Reasoning
### Human–AI co-execution of physical tasks through adaptive guidance
**Programa Delfín · Universidad EAFIT · Junio 2026**

## ¿Qué es este proyecto?

CircuitBuilder AI es una aplicación web que permite a estudiantes subir una imagen de un diagrama eléctrico y recibir instrucciones visuales paso a paso para ensamblar el circuito en una protoboard física. El sistema identifica los componentes del esquemático, planifica las conexiones y las muestra de forma interactiva sobre un canvas digital de la protoboard.

Este módulo es el primer entregable funcional del proyecto de investigación **Shared Reasoning**, que estudia la co-ejecución de tareas físicas complejas entre humanos e inteligencia artificial.

## Arquitectura del sistema

El sistema está compuesto por dos agentes encadenados:

- **Extractor Agent** — recibe la imagen del esquemático, la analiza con un modelo multimodal y devuelve un JSON con los componentes y la topología del circuito (netlist).
- **Planner Agent** — recibe el netlist y genera instrucciones de armado con coordenadas físicas de la protoboard (fila, columna, color de cable, secuencia).

Los dos agentes están orquestados con **LangGraph** y comparten un estado común que mantiene el historial de chat, el paso actual y el modo de interacción.

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Modelo multimodal | Gemini 2.0 Flash |
| Framework de agentes | LangGraph |
| Backend | FastAPI (Python) |
| Frontend | React + Vite |
| Canvas interactivo | Konva.js + React-Konva |
| Estilos | Tailwind CSS |

## Estructura de carpetas

\`\`\`
Shared_Reasoning/
├── backend/
│   ├── agents/          # Extractor Agent y Planner Agent
│   ├── providers/       # Interfaz LLMProvider y sus implementaciones
│   ├── schemas/         # Schema JSON del netlist
│   └── main.py          # Entrada principal de FastAPI
├── frontend/
│   ├── src/
│   │   ├── components/  # Canvas, Chat, Panel de esquemático
│   │   ├── hooks/       # Lógica reutilizable
│   │   └── App.jsx
│   └── index.html
└── README.md
\`\`\`

## Cómo correr el proyecto localmente

**Backend**
\`\`\`bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
\`\`\`

**Frontend**
\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`

## Equipo

| Nombre | Rol |
|--------|-----|
| Cristopher Rojas (DanteXhunter) | Desarrollo — Programa Delfín |
| Diego Rojas (DiegoRojas8509) | Desarrollo — Programa Delfín |

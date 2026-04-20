# DevManage

**La plataforma todo-en-uno para el ciclo de vida del desarrollo de software.**

DevManage centraliza la gestión de proyectos, la documentación técnica y la actividad de GitHub en un solo lugar, eliminando la necesidad de alternar entre Jira, Notion y GitHub para entender en qué está trabajando el equipo.

---

## Problema que resuelve

Los equipos de desarrollo viven entre tres herramientas que no se hablan entre sí: el tablero de tareas, el wiki de documentación y el repositorio de código. El resultado es que nadie sabe realmente en qué archivo está trabajando un desarrollador, qué tarea está vinculada a qué rama, ni cuánto avance real tiene el proyecto sin preguntar.

DevManage conecta estas tres piezas en una sola interfaz.

---

## Funcionalidades

### Motor de gestión de proyectos (Kanban)

- Creación de múltiples proyectos con tableros Kanban configurables.
- Columnas dinámicas y personalizables: Backlog, To-Do, En Progreso, Code Review, Hecho — o cualquier flujo que el equipo defina.
- Jerarquía de trabajo en tres niveles: Épicas → Tareas → Subtareas.
- Etiquetas, prioridades (crítica, alta, media, baja) y asignación de responsables.
- Filtros rápidos: Mis tareas, Tareas bloqueadas, PRs pendientes de revisión.
- Historial de actividad por tarea: cada cambio de columna, reasignación o vínculo con GitHub queda registrado automáticamente.

### Documentación nativa (Wiki)

- Base de conocimiento integrada al proyecto, sin salir de DevManage.
- Editor Markdown con soporte de jerarquía de páginas (secciones y subsecciones).
- Vinculación directa entre páginas de documentación y tareas del tablero.
- Historial de ediciones con autor y timestamp de cada cambio.
- Ideal para arquitectura del sistema, decisiones técnicas, guías de onboarding y requerimientos.

### GitHub Bridge (solo lectura)

- Conexión con repositorios de GitHub para visualizar la actividad del código en contexto.
- Detección automática de ramas, commits y pull requests vinculados a cada tarea.
- Timeline en vivo dentro de cada tarea: rama creada → commits con archivos modificados → PR abierto.
- Indicador visual de "Actividad en curso" cuando hay commits recientes en la rama vinculada, sin mover la tarjeta manualmente.
- Vista de archivos activos: qué archivos tocó cada desarrollador en los últimos commits.
- DevManage **nunca escribe** en GitHub. Solo lee y muestra la información.

### Seguimiento de progreso

- Porcentaje de completitud del proyecto calculado automáticamente según tareas terminadas.
- Panel de hitos con fechas y estado visual.
- Estadísticas del repositorio: ramas activas, commits en los últimos 30 días, PRs cerrados.
- Feed de actividad unificado: eventos del tablero y de GitHub en una sola línea de tiempo.

### Actividad en tiempo real

- El tablero se actualiza en vivo cuando un desarrollador hace push a una rama vinculada.
- El líder técnico ve el estado real del trabajo sin preguntar: qué archivo se está editando, si el PR ya está abierto, cuántos commits lleva la tarea.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Estado | TanStack Query + Zustand |
| UI | Tailwind CSS + dnd kit |
| Backend | NestJS + TypeScript |
| Base de datos | SQL Server |
| Tiempo real | Socket.io (WebSockets) |
| Auth | JWT + GitHub OAuth |
| Frontend hosting | Vercel |
| Backend hosting | Render |

---

## Estructura del proyecto

```
devmanage/
├── devmanage-frontend/     # React + Vite
└── devmanage-backend/      # NestJS + SQL Server
    ├── src/
    │   ├── config/         # Variables de entorno tipadas
    │   ├── database/       # Pool de conexión SQL Server
    │   ├── auth/           # JWT + GitHub OAuth
    │   ├── nucleo/         # Usuarios, equipos, proyectos
    │   ├── tablero/        # Kanban, tareas, épicas
    │   ├── documentos/     # Wiki y vínculos
    │   ├── github/         # Webhook y sincronización (solo lectura)
    │   └── realtime/       # WebSocket gateway
    └── .env.example
```

---

## Esquema de base de datos

La base de datos está organizada en cuatro esquemas que reflejan los dominios del sistema:

- `nucleo` — Usuarios, equipos y proyectos.
- `tablero` — Columnas, épicas, tareas, etiquetas, comentarios y actividad.
- `documentos` — Páginas wiki y vínculos a tareas.
- `github` — Repositorios, ramas, confirmaciones, archivos modificados y solicitudes de integración (solo lectura).

---

## Despliegue

### Variables de entorno

Copia `.env.example` a `.env` y completa los valores:

```bash
cp .env.example .env
```

Las variables requeridas son:

- Conexión a SQL Server (`DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`)
- Secretos JWT (`JWT_SECRET`, `JWT_REFRESH_SECRET`)
- GitHub OAuth App (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`)
- Secreto del webhook de GitHub (`GITHUB_WEBHOOK_SECRET`)

### Desarrollo local

```bash
# Backend
cd devmanage-backend
npm install
npm run start:dev

# Frontend
cd devmanage-frontend
npm install
npm run dev
```

### Producción

- **Frontend** → desplegado en Vercel conectando el repositorio de GitHub.
- **Backend** → desplegado en Render como Web Service con las variables de entorno configuradas en el dashboard.
- **Base de datos** → SQL Server externo, accesible desde las IPs de salida de Render.

---

## Configuración del GitHub Bridge

1. Crear una **GitHub OAuth App** en `https://github.com/settings/developers`.
   - Authorization callback URL: `https://tu-backend.render.com/auth/github/callback`
   - Scopes requeridos: `user:email`, `repo` (solo lectura)

2. Crear un **Webhook** en cada repositorio que quieras conectar:
   - Payload URL: `https://tu-backend.render.com/github/webhook`
   - Content type: `application/json`
   - Secret: el valor de `GITHUB_WEBHOOK_SECRET`
   - Eventos: `push`, `pull_request`, `create`, `delete`

3. Desde DevManage, vincular el repositorio al proyecto correspondiente.

---

## Roadmap

- [ ] Notificaciones por correo al asignar tareas
- [ ] Exportar tablero a PDF
- [ ] Integración con Slack para alertas de actividad
- [ ] App móvil (React Native)
- [ ] Soporte multi-idioma

---

## Licencia

Uso privado — todos los derechos reservados.
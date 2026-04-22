# DevManage

Plataforma para unificar **proyectos**, **tablero Kanban**, **documentación** y **visibilidad de GitHub** en un solo lugar.

---

## Contenido de esta documentación

- [Requisitos](#requisitos)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Puesta en marcha local](#puesta-en-marcha-local)
- [Variables de entorno](#variables-de-entorno)
- [Base de datos](#base-de-datos)
- [API y documentación OpenAPI](#api-y-documentación-openapi)
- [Módulos principales](#módulos-principales)
- [Integración GitHub](#integración-github)
- [Despliegue](#despliegue)
- [Roadmap](#roadmap)

---

## Requisitos

- **Node.js** 20+ (o **Bun** 1.x, si ya lo usas en el equipo)
- **SQL Server** accesible desde la máquina o desde el hosting del backend
- Cuenta **GitHub** para OAuth y/o webhooks (opcional según el flujo)

---

## Estructura del repositorio

```
DevManage/
├── DevManage-Frontend/    # React + TypeScript + Vite
├── DevManage-Backend/     # NestJS + TypeScript + SQL Server
└── README.md              # Este archivo
```

El DDL completo del esquema está en:

`DevManage-Backend/Database/BASE DE DATOS.sql`

---

## Puesta en marcha local

### 1. Base de datos

Ejecuta el script SQL contra tu instancia (crea esquemas `nucleo`, `tablero`, `documentos`, `github`, etc.).

### 2. Backend

```bash
cd DevManage-Backend
cp .env.example .env
# Edita .env con SQL Server, JWT y (opcional) GitHub

bun install   # o npm install
bun run start:dev
```

Por defecto el API escucha en el puerto configurado en `PORT` (típicamente `3000`).

### 3. Frontend

```bash
cd DevManage-Frontend
# Opcional: .env con VITE_API_URL=http://localhost:3000 (por defecto ya usa ese valor)

bun install   # o npm install
bun run dev
```

Asegúrate de que **CORS** en el backend incluya el origen del frontend (variable `CORS_ORIGIN` en `.env`).

---

## Variables de entorno

Referencia principal: `DevManage-Backend/.env.example`.

| Área | Variables (ejemplos) | Notas |
|------|----------------------|--------|
| Servidor | `PORT`, `CORS_ORIGIN` | Orígenes separados por coma |
| App | `FRONTEND_URL` | Base URL del frontend; usada tras OAuth GitHub |
| SQL Server | `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE`, `DB_CONNECT_TIMEOUT_MS` | Ajusta firewall si la BD está en la nube |
| Auth | `JWT_SECRET`, `JWT_EXPIRES_IN` | El secreto debe ser fuerte en producción |
| GitHub | `GITHUB_WEBHOOK_SECRET`, `GITHUB_TOKEN` (opcional), `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_OAUTH_CALLBACK_URL` | OAuth: callback debe coincidir **exactamente** con la GitHub OAuth App |

---

## Base de datos

Esquemas conceptuales:

- **`nucleo`** — usuarios, proyectos, membresías
- **`tablero`** — columnas, épicas, tareas, actividad
- **`documentos`** — wiki / páginas (si está en uso en tu despliegue)
- **`github`** — repositorios vinculados, ramas, confirmaciones, PRs, vínculos tarea ↔ GitHub

DevManage **no escribe** en GitHub; solo consume la API y webhooks para reflejar estado en la BD.

---

## API y documentación OpenAPI

Con el backend en marcha:

| Recurso | Ruta típica |
|---------|-------------|
| Documentación interactiva (Scalar) | `http://localhost:3000/docs` |
| Especificación Swagger UI | `http://localhost:3000/openapi` |
| Salud | `http://localhost:3000/health` |
| Salud + BD | `http://localhost:3000/health/db` |

---

## Módulos principales

### Tablero (Kanban)

- Columnas y tareas con drag-and-drop
- Épicas, tarea padre, responsable, prioridad, tipo, fecha límite
- Descripción de tarea con **Markdown** (editor con vista en vivo y lectura formateada)

### Autenticación

- JWT para sesión de la aplicación
- **GitHub OAuth** opcional por usuario (para leer repos privados y sincronizar sin PAT en el cliente)

### GitHub (solo lectura hacia GitHub)

- Vincular repositorios a un proyecto
- Listado de ramas y PRs ingeridos
- Vista detallada por repositorio: filtros, archivos de PR, diffs, commits, trazabilidad con tareas, eventos hacia producción (`main`), etc.
- Webhooks `push` y `pull_request` para mantener datos al día; sincronización manual y refresco periódico en la UI

### Documentación en app

- Wiki / páginas según lo desplegado en tu instancia (esquema `documentos` en SQL)

---

## Integración GitHub

### 1. OAuth App (usuarios)

En GitHub: **Settings → Developer settings → OAuth Apps**.

- **Authorization callback URL**: debe ser exactamente  
  `{URL_PÚBLICA_DEL_API}/auth/github/callback`  
  (ej. `https://tu-servicio.onrender.com/auth/github/callback`)
- Configura en el servidor: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_OAUTH_CALLBACK_URL`, `FRONTEND_URL`

Tras autorizar, el usuario puede resolver repos privados y usar sincronización sin pegar tokens en la UI.

### 2. Webhook (por repositorio)

- **Payload URL**: `{URL_PÚBLICA_DEL_API}/github/webhook`
- **Content type**: `application/json`
- **Secret**: mismo valor que `GITHUB_WEBHOOK_SECRET`
- **Eventos**: al menos `push` y `pull_request`

### 3. PAT del servidor (opcional)

`GITHUB_TOKEN` permite que el servidor consulte la API de GitHub cuando no hay OAuth de usuario; útil para scripts o entornos sin login GitHub en cada petición.

### 4. Vincular repositorio

Desde la UI de GitHub en DevManage: conectar cuenta, vincular repo al proyecto activo. Tras vincular, conviene ejecutar **Sincronizar** al menos una vez si el historial no está completo.

---

## Despliegue

- **Backend**: servicio Node (por ejemplo Render) con todas las variables de entorno y acceso saliente a SQL Server.
- **Frontend**: estático o SSR según tu elección (por ejemplo Vercel); configurar `CORS_ORIGIN` y la URL base del API en el cliente.
- **GitHub**: callback URL y webhook deben apuntar al dominio **real** del backend desplegado.

---

## Roadmap

Ideas de evolución (no exhaustivo):

- Notificaciones (correo / Slack)
- Exportación de tablero o informes
- Optimización de sincronización incremental en repos muy grandes
- Mejoras de tiempo real (WebSockets) si el producto lo requiere

---

## Licencia

Uso privado — todos los derechos reservados.

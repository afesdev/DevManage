# DevManage — Reglas de desarrollo para agentes de IA

Este archivo define las convenciones, restricciones y decisiones de arquitectura
del proyecto DevManage. Todo agente de IA (Cursor, Claude, Gemini, Copilot, etc.)
debe leerlo antes de generar, modificar o sugerir código.

---

## Contexto del proyecto

DevManage es una plataforma SaaS web todo-en-uno para la gestión del ciclo de vida
del desarrollo de software. Incluye tablero Kanban, documentación (Wiki), seguimiento
de progreso y un GitHub Bridge de **solo lectura**.

- **Frontend:** React 19 + TypeScript + Vite — desplegado en Vercel
- **Backend:** NestJS + TypeScript — desplegado en Render
- **Base de datos:** SQL Server (servidor externo, conexión via `.env`)
- **Tiempo real:** Socket.io (WebSockets) para actividad en vivo del tablero

---

## Reglas de base de datos

### Nomenclatura — TODO en español

Tablas, columnas, constraints, stored procedures, vistas y valores de datos
van en español. Sin excepciones.

```sql
-- CORRECTO
SELECT usuario_id, nombre_visible FROM nucleo.Usuarios WHERE esta_activo = 1

-- INCORRECTO
SELECT userId, displayName FROM core.Users WHERE isActive = 1
```

### Schemas (no tocar la estructura)

La BD tiene 4 schemas fijos. No crear tablas fuera de ellos:

| Schema | Contenido |
|---|---|
| `nucleo` | Usuarios, Equipos, Proyectos, MiembrosEquipo, MiembrosProyecto |
| `tablero` | Columnas, Epicas, Tareas, Etiquetas, Comentarios, Actividad |
| `documentos` | Paginas, VinculosPaginaTarea |
| `github` | Repositorios, Ramas, Confirmaciones, ArchivosConfirmacion, SolicitudesIntegracion, VinculosTareaGithub |

### PKs siempre UNIQUEIDENTIFIER

```sql
-- CORRECTO
usuario_id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID()

-- INCORRECTO
id INT IDENTITY(1,1)
```

### GitHub Bridge — SOLO LECTURA

El schema `github` es de ingesta únicamente. Ningún endpoint, servicio ni función
debe escribir de vuelta a GitHub. Solo se permite:
- Recibir webhooks entrantes de GitHub (`POST /github/webhook`)
- Consultar la GitHub REST API con scope `repo:read`
- Insertar/actualizar registros en las tablas del schema `github`

```typescript
// CORRECTO — leer datos de GitHub
const ramas = await githubApi.get(`/repos/${repo}/branches`);

// INCORRECTO — escribir en GitHub
await githubApi.post(`/repos/${repo}/issues`, { title: '...' });
await githubApi.patch(`/repos/${repo}/pulls/1`, { state: 'closed' });
```

### Stored procedures — usar los existentes

Para operaciones críticas usar los stored procedures ya definidos:

- `tablero.pa_MoverTarea` — mover tarea entre columnas
- `github.pa_InsertarConfirmacion` — ingestar commit (idempotente)
- `github.pa_InsertarSolicitudIntegracion` — ingestar PR (idempotente)

```typescript
// CORRECTO
await this.db.execute('tablero.pa_MoverTarea', {
  tarea_id:      id,
  nueva_columna: columnaId,
  actor_id:      usuarioId,
});

// INCORRECTO — nunca reescribir la lógica de un SP existente inline
await this.db.query(`UPDATE tablero.Tareas SET columna_id = @col WHERE tarea_id = @id`, ...);
```

---

## Reglas de backend (NestJS)

### Estructura de módulos — espejo de schemas

Cada módulo NestJS corresponde a un schema de BD. No mezclar lógica entre módulos
sin pasar por el servicio del módulo dueño.

```
src/nucleo/      → schema nucleo.*
src/tablero/     → schema tablero.*
src/documentos/  → schema documentos.*
src/github/      → schema github.*
src/auth/        → autenticación (JWT + GitHub OAuth)
src/realtime/    → WebSocket gateway
src/database/    → pool de conexión (único, global)
```

### DatabaseService — único punto de acceso a SQL Server

Nunca importar `mssql` directamente en servicios. Siempre usar `DatabaseService`:

```typescript
// CORRECTO
constructor(private readonly db: DatabaseService) {}
await this.db.query('SELECT ...', { param: value });
await this.db.execute('schema.pa_NombreProcedimiento', { ... });
await this.db.queryOne('SELECT TOP 1 ...', { ... });

// INCORRECTO
import * as sql from 'mssql';
const pool = new sql.ConnectionPool(...);
```

### DTOs — siempre con validación

Todo endpoint que reciba datos del cliente debe tener un DTO con decoradores
de `class-validator`. Sin excepciones.

```typescript
// CORRECTO
export class CrearTareaDto {
  @IsString()
  @MaxLength(300)
  titulo: string;

  @IsUUID()
  columna_id: string;

  @IsIn(['tarea', 'subtarea', 'error'])
  @IsOptional()
  tipo?: string;
}

// INCORRECTO
@Post()
crearTarea(@Body() body: any) { ... }
```

### Nombres en español — servicios, métodos y variables de dominio

Los métodos de servicios y variables que representen conceptos de negocio
van en español. El código de infraestructura (decoradores, interfaces de NestJS,
nombres de archivos) puede ir en inglés siguiendo las convenciones del framework.

```typescript
// CORRECTO
async crearTarea(dto: CrearTareaDto, creadorId: string) { ... }
async moverTarea(tareaId: string, nuevaColumnaId: string) { ... }
async obtenerProyecto(proyectoId: string) { ... }

// INCORRECTO
async createTask(dto: CreateTaskDto, creatorId: string) { ... }
async moveCard(taskId: string, newColumnId: string) { ... }
```

### Guards en todos los endpoints protegidos

Todo endpoint que requiera usuario autenticado debe tener `@UseGuards(JwtGuard)`.
Los endpoints públicos deben ser explícitos con un comentario.

```typescript
// CORRECTO
@UseGuards(JwtGuard)
@Get(':id')
obtenerTarea(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAuth) { ... }

// Endpoint público — sin guard intencionalmente
@Post('login')
login(@Body() dto: LoginDto) { ... }
```

### Variables de entorno — siempre via ConfigService

Nunca acceder a `process.env` directamente en servicios o controladores.
Solo se permite en archivos de `src/config/`.

```typescript
// CORRECTO
constructor(private readonly config: ConfigService) {}
const secret = this.config.get<string>('jwt.secret');

// INCORRECTO
const secret = process.env.JWT_SECRET;
```

### Webhook de GitHub — validar firma HMAC siempre

Todo request entrante a `POST /github/webhook` debe validar la firma
`X-Hub-Signature-256` antes de procesar el payload.

```typescript
// CORRECTO — verificar firma antes de cualquier lógica
const firma = req.headers['x-hub-signature-256'];
const esValida = this.webhookService.verificarFirma(payload, firma);
if (!esValida) throw new UnauthorizedException('Firma de webhook inválida');
```

---

## Reglas de frontend (React)

### Estructura de carpetas

```
src/
├── components/     # Componentes reutilizables (sin lógica de negocio)
├── pages/          # Una carpeta por módulo: tablero/, documentos/, github/
├── hooks/          # Custom hooks (useProyecto, useTareas, etc.)
├── services/       # Llamadas a la API (axios)
├── store/          # Estado global con Zustand
├── types/          # Interfaces TypeScript del dominio
└── utils/          # Funciones puras
```

### Nombres de tipos — en español, reflejando la BD

```typescript
// CORRECTO — refleja nucleo.Usuarios
interface Usuario {
  usuario_id:     string;
  correo:         string;
  nombre_visible: string;
  usuario_github: string | null;
}

// CORRECTO — refleja tablero.Tareas
interface Tarea {
  tarea_id:       string;
  titulo:         string;
  tipo:           'tarea' | 'subtarea' | 'error';
  prioridad:      'critica' | 'alta' | 'media' | 'baja';
  columna_id:     string;
  responsable_id: string | null;
}

// INCORRECTO
interface Task {
  id:       string;
  name:     string;
  priority: string;
}
```

### TanStack Query — para todo estado del servidor

No usar `useState` + `useEffect` para fetchear datos de la API.
Siempre usar `useQuery` y `useMutation` de TanStack Query.

```typescript
// CORRECTO
const { data: tareas, isLoading } = useQuery({
  queryKey: ['tareas', proyectoId],
  queryFn:  () => tareasService.obtenerPorProyecto(proyectoId),
});

// INCORRECTO
const [tareas, setTareas] = useState([]);
useEffect(() => {
  fetch('/api/tareas').then(r => r.json()).then(setTareas);
}, []);
```

### Zustand — solo para estado de UI global

Zustand es para estado de interfaz (usuario actual, proyecto activo, modales abiertos),
no para datos que vienen del servidor (eso es TanStack Query).

```typescript
// CORRECTO — estado de UI en Zustand
interface AppStore {
  usuarioActual:    Usuario | null;
  proyectoActivo:   string | null;
  setProyectoActivo: (id: string) => void;
}

// INCORRECTO — datos del servidor en Zustand
interface AppStore {
  tareas: Tarea[];        // ← esto va en TanStack Query
  fetchTareas: () => void;
}
```

### Paleta de colores — tokens fijos

No usar colores hardcodeados. Usar solo estos tokens definidos en Tailwind:

```
Principal:    #534AB7  (purple-600)
Fondo:        #F5F4F2  (stone-100)
Superficie:   #FFFFFF
Borde:        #D9D8D4  (stone-300)
Texto:        #1C1C1A  (stone-900)
Texto muted:  #737370  (stone-500)
Éxito:        #1D9E75  (teal-600)
Advertencia:  #BA7517  (amber-600)
Error:        #E24B4A  (red-500)
```

---

## Reglas generales

### Seguridad

- Nunca loguear tokens, contraseñas ni el `token_github` del usuario.
- El `token_github` se almacena cifrado. Nunca exponerlo en respuestas de API.
- El `secreto_webhook` de GitHub nunca se incluye en respuestas ni logs.
- Usar HTTPS siempre en producción. Rechazar requests HTTP en Render.

### Variables de entorno

- El archivo `.env` nunca se sube a GitHub. Está en `.gitignore`.
- Toda nueva variable de entorno debe agregarse también a `.env.example` con un comentario explicativo.
- En Render, las variables se configuran en el dashboard de Environment Variables.

### Migraciones de base de datos

- Ningún agente debe ejecutar `ALTER TABLE`, `DROP TABLE` ni `DROP COLUMN`
  directamente sobre la BD de producción.
- Todo cambio de esquema va en un archivo de migración numerado en `migrations/`.
- Formato: `migrations/0001_descripcion_del_cambio.sql`

### Commits

- Formato: `tipo(módulo): descripción en español`
- Tipos: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
- Ejemplos:
  - `feat(tablero): agregar endpoint para mover tarea entre columnas`
  - `fix(github): corregir validación de firma HMAC en webhook`
  - `docs(readme): actualizar instrucciones de despliegue en Render`

---

## Lo que un agente NUNCA debe hacer

- Escribir en GitHub desde el código (crear issues, comentarios, PRs, commits).
- Usar `process.env` fuera de `src/config/`.
- Crear tablas o columnas en el schema `dbo` — todo va en los 4 schemas definidos.
- Cambiar los nombres de tablas o columnas al inglés.
- Exponer el `token_github`, `hash_contrasena` o `secreto_webhook` en respuestas de API.
- Usar `any` en TypeScript sin un comentario que justifique por qué.
- Hacer queries directas a las tablas de `github.*` para escribir datos —
  solo a través de los stored procedures `pa_InsertarConfirmacion` y `pa_InsertarSolicitudIntegracion`.
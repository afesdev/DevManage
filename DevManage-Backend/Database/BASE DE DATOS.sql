-- ============================================================
--  DevManage — DDL completo para SQL Server
--  Nomenclatura: español en tablas, columnas, constraints y valores
--  GitHub Bridge: SOLO LECTURA (ingesta via webhook, sin escritura al repo)
--  Token de GitHub requiere scope repo:read únicamente
--  Compatible con SQL Server 2019 / 2022
-- ============================================================

USE master;
GO

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'DevManageDB')
    CREATE DATABASE DevManageDB
        COLLATE Modern_Spanish_100_CI_AS_SC_UTF8;
GO

USE DevManageDB;
GO

-- ============================================================
--  ESQUEMAS por dominio
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'nucleo')
    EXEC('CREATE SCHEMA nucleo');
GO
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'tablero')
    EXEC('CREATE SCHEMA tablero');
GO
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'documentos')
    EXEC('CREATE SCHEMA documentos');
GO
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'github')   -- solo lectura
    EXEC('CREATE SCHEMA github');
GO


-- ============================================================
--  DOMINIO: nucleo — Usuarios, Equipos, Proyectos
-- ============================================================

CREATE TABLE nucleo.Usuarios (
    usuario_id          UNIQUEIDENTIFIER  NOT NULL  DEFAULT NEWSEQUENTIALID(),
    correo              NVARCHAR(320)     NOT NULL,
    nombre_visible      NVARCHAR(100)     NOT NULL,
    url_avatar          NVARCHAR(500)     NULL,
    usuario_github      NVARCHAR(100)     NULL,
    -- Almacenar cifrado desde la capa de aplicación (scope: repo:read, read:user)
    token_github        NVARCHAR(500)     NULL,
    hash_contrasena     NVARCHAR(256)     NULL,      -- NULL si solo usa OAuth
    esta_activo         BIT               NOT NULL  DEFAULT 1,
    creado_en           DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),
    actualizado_en      DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CP_Usuarios              PRIMARY KEY (usuario_id),
    CONSTRAINT UQ_Usuarios_Correo       UNIQUE      (correo),
    CONSTRAINT UQ_Usuarios_Github       UNIQUE      (usuario_github),
    CONSTRAINT CK_Usuarios_Correo       CHECK       (correo LIKE '%@%.%')
);
GO

CREATE TABLE nucleo.Equipos (
    equipo_id       UNIQUEIDENTIFIER  NOT NULL  DEFAULT NEWSEQUENTIALID(),
    nombre          NVARCHAR(100)     NOT NULL,
    slug            NVARCHAR(100)     NOT NULL,
    descripcion     NVARCHAR(500)     NULL,
    creado_por      UNIQUEIDENTIFIER  NOT NULL,
    creado_en       DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CP_Equipos           PRIMARY KEY (equipo_id),
    CONSTRAINT UQ_Equipos_Slug      UNIQUE      (slug),
    CONSTRAINT FK_Equipos_CreadoPor
        FOREIGN KEY (creado_por) REFERENCES nucleo.Usuarios(usuario_id)
);
GO

CREATE TABLE nucleo.MiembrosEquipo (
    equipo_id       UNIQUEIDENTIFIER  NOT NULL,
    usuario_id      UNIQUEIDENTIFIER  NOT NULL,
    -- propietario | administrador | miembro
    rol             NVARCHAR(20)      NOT NULL  DEFAULT 'miembro',
    unido_en        DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CP_MiembrosEquipo        PRIMARY KEY (equipo_id, usuario_id),
    CONSTRAINT FK_MiembrosEquipo_Equipo
        FOREIGN KEY (equipo_id)   REFERENCES nucleo.Equipos(equipo_id)   ON DELETE CASCADE,
    CONSTRAINT FK_MiembrosEquipo_Usuario
        FOREIGN KEY (usuario_id)  REFERENCES nucleo.Usuarios(usuario_id),
    CONSTRAINT CK_MiembrosEquipo_Rol
        CHECK (rol IN ('propietario', 'administrador', 'miembro'))
);
GO

CREATE TABLE nucleo.Proyectos (
    proyecto_id     UNIQUEIDENTIFIER  NOT NULL  DEFAULT NEWSEQUENTIALID(),
    equipo_id       UNIQUEIDENTIFIER  NOT NULL,
    nombre          NVARCHAR(100)     NOT NULL,
    slug            NVARCHAR(100)     NOT NULL,
    descripcion     NVARCHAR(1000)    NULL,
    -- activo | archivado | pausado
    estado          NVARCHAR(20)      NOT NULL  DEFAULT 'activo',
    creado_por      UNIQUEIDENTIFIER  NOT NULL,
    creado_en       DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),
    actualizado_en  DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),
    archivado_en    DATETIME2(0)      NULL,

    CONSTRAINT CP_Proyectos             PRIMARY KEY (proyecto_id),
    CONSTRAINT UQ_Proyectos_Slug        UNIQUE      (equipo_id, slug),
    CONSTRAINT FK_Proyectos_Equipo
        FOREIGN KEY (equipo_id)  REFERENCES nucleo.Equipos(equipo_id),
    CONSTRAINT FK_Proyectos_CreadoPor
        FOREIGN KEY (creado_por) REFERENCES nucleo.Usuarios(usuario_id),
    CONSTRAINT CK_Proyectos_Estado
        CHECK (estado IN ('activo', 'archivado', 'pausado'))
);
GO

CREATE TABLE nucleo.MiembrosProyecto (
    proyecto_id     UNIQUEIDENTIFIER  NOT NULL,
    usuario_id      UNIQUEIDENTIFIER  NOT NULL,
    -- propietario | lider | miembro | espectador
    rol             NVARCHAR(20)      NOT NULL  DEFAULT 'miembro',
    unido_en        DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CP_MiembrosProyecto           PRIMARY KEY (proyecto_id, usuario_id),
    CONSTRAINT FK_MiembrosProyecto_Proyecto
        FOREIGN KEY (proyecto_id) REFERENCES nucleo.Proyectos(proyecto_id) ON DELETE CASCADE,
    CONSTRAINT FK_MiembrosProyecto_Usuario
        FOREIGN KEY (usuario_id)  REFERENCES nucleo.Usuarios(usuario_id),
    CONSTRAINT CK_MiembrosProyecto_Rol
        CHECK (rol IN ('propietario', 'lider', 'miembro', 'espectador'))
);
GO


-- ============================================================
--  DOMINIO: tablero — Columnas Kanban, Épicas, Tareas
-- ============================================================

CREATE TABLE tablero.Columnas (
    columna_id      UNIQUEIDENTIFIER  NOT NULL  DEFAULT NEWSEQUENTIALID(),
    proyecto_id     UNIQUEIDENTIFIER  NOT NULL,
    nombre          NVARCHAR(80)      NOT NULL,
    posicion        INT               NOT NULL  DEFAULT 0,   -- orden de izquierda a derecha
    color           NVARCHAR(7)       NULL,                  -- hex, ej: #534AB7
    es_estado_final BIT               NOT NULL  DEFAULT 0,   -- para cálculo de progreso
    creado_en       DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CP_Columnas              PRIMARY KEY (columna_id),
    CONSTRAINT UQ_Columnas_Posicion     UNIQUE      (proyecto_id, posicion),
    CONSTRAINT FK_Columnas_Proyecto
        FOREIGN KEY (proyecto_id) REFERENCES nucleo.Proyectos(proyecto_id) ON DELETE CASCADE
);
GO

CREATE TABLE tablero.Epicas (
    epica_id        UNIQUEIDENTIFIER  NOT NULL  DEFAULT NEWSEQUENTIALID(),
    proyecto_id     UNIQUEIDENTIFIER  NOT NULL,
    titulo          NVARCHAR(200)     NOT NULL,
    descripcion     NVARCHAR(MAX)     NULL,
    -- abierta | en_progreso | terminada | cancelada
    estado          NVARCHAR(20)      NOT NULL  DEFAULT 'abierta',
    creado_por      UNIQUEIDENTIFIER  NOT NULL,
    fecha_inicio    DATE              NULL,
    fecha_limite    DATE              NULL,
    creado_en       DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),
    actualizado_en  DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CP_Epicas            PRIMARY KEY (epica_id),
    CONSTRAINT FK_Epicas_Proyecto
        FOREIGN KEY (proyecto_id) REFERENCES nucleo.Proyectos(proyecto_id) ON DELETE CASCADE,
    CONSTRAINT FK_Epicas_CreadoPor
        FOREIGN KEY (creado_por)  REFERENCES nucleo.Usuarios(usuario_id),
    CONSTRAINT CK_Epicas_Estado
        CHECK (estado IN ('abierta', 'en_progreso', 'terminada', 'cancelada')),
    CONSTRAINT CK_Epicas_Fechas
        CHECK (fecha_limite IS NULL OR fecha_inicio IS NULL OR fecha_limite >= fecha_inicio)
);
GO

CREATE TABLE tablero.Tareas (
    tarea_id            UNIQUEIDENTIFIER  NOT NULL  DEFAULT NEWSEQUENTIALID(),
    proyecto_id         UNIQUEIDENTIFIER  NOT NULL,
    epica_id            UNIQUEIDENTIFIER  NULL,
    tarea_padre_id      UNIQUEIDENTIFIER  NULL,       -- NULL = tarea raíz, NOT NULL = subtarea
    columna_id          UNIQUEIDENTIFIER  NOT NULL,
    titulo              NVARCHAR(300)     NOT NULL,
    descripcion         NVARCHAR(MAX)     NULL,
    -- tarea | subtarea | error
    tipo                NVARCHAR(20)      NOT NULL  DEFAULT 'tarea',
    -- critica | alta | media | baja
    prioridad           NVARCHAR(10)      NOT NULL  DEFAULT 'media',
    posicion            INT               NOT NULL  DEFAULT 0,  -- orden dentro de la columna
    responsable_id      UNIQUEIDENTIFIER  NULL,
    creado_por          UNIQUEIDENTIFIER  NOT NULL,
    fecha_limite        DATE              NULL,
    creado_en           DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),
    actualizado_en      DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),
    completado_en       DATETIME2(0)      NULL,

    CONSTRAINT CP_Tareas                PRIMARY KEY (tarea_id),
    CONSTRAINT FK_Tareas_Proyecto
        FOREIGN KEY (proyecto_id)    REFERENCES nucleo.Proyectos(proyecto_id),
    CONSTRAINT FK_Tareas_Epica
        FOREIGN KEY (epica_id)       REFERENCES tablero.Epicas(epica_id)  ON DELETE SET NULL,
    CONSTRAINT FK_Tareas_Padre
        FOREIGN KEY (tarea_padre_id) REFERENCES tablero.Tareas(tarea_id),
    CONSTRAINT FK_Tareas_Columna
        FOREIGN KEY (columna_id)     REFERENCES tablero.Columnas(columna_id),
    CONSTRAINT FK_Tareas_Responsable
        FOREIGN KEY (responsable_id) REFERENCES nucleo.Usuarios(usuario_id),
    CONSTRAINT FK_Tareas_CreadoPor
        FOREIGN KEY (creado_por)     REFERENCES nucleo.Usuarios(usuario_id),
    CONSTRAINT CK_Tareas_Tipo
        CHECK (tipo IN ('tarea', 'subtarea', 'error')),
    CONSTRAINT CK_Tareas_Prioridad
        CHECK (prioridad IN ('critica', 'alta', 'media', 'baja')),
    CONSTRAINT CK_Tareas_SinAutorreferencia
        CHECK (tarea_padre_id <> tarea_id)
);
GO

CREATE TABLE tablero.Etiquetas (
    etiqueta_id     UNIQUEIDENTIFIER  NOT NULL  DEFAULT NEWSEQUENTIALID(),
    proyecto_id     UNIQUEIDENTIFIER  NOT NULL,
    nombre          NVARCHAR(50)      NOT NULL,
    color           NVARCHAR(7)       NOT NULL  DEFAULT '#888780',

    CONSTRAINT CP_Etiquetas             PRIMARY KEY (etiqueta_id),
    CONSTRAINT UQ_Etiquetas_Nombre      UNIQUE      (proyecto_id, nombre),
    CONSTRAINT FK_Etiquetas_Proyecto
        FOREIGN KEY (proyecto_id) REFERENCES nucleo.Proyectos(proyecto_id) ON DELETE CASCADE
);
GO

CREATE TABLE tablero.TareasEtiquetas (
    tarea_id        UNIQUEIDENTIFIER  NOT NULL,
    etiqueta_id     UNIQUEIDENTIFIER  NOT NULL,

    CONSTRAINT CP_TareasEtiquetas           PRIMARY KEY (tarea_id, etiqueta_id),
    CONSTRAINT FK_TareasEtiquetas_Tarea
        FOREIGN KEY (tarea_id)    REFERENCES tablero.Tareas(tarea_id)    ON DELETE CASCADE,
    CONSTRAINT FK_TareasEtiquetas_Etiqueta
        FOREIGN KEY (etiqueta_id) REFERENCES tablero.Etiquetas(etiqueta_id)
);
GO

CREATE TABLE tablero.Comentarios (
    comentario_id   UNIQUEIDENTIFIER  NOT NULL  DEFAULT NEWSEQUENTIALID(),
    tarea_id        UNIQUEIDENTIFIER  NOT NULL,
    autor_id        UNIQUEIDENTIFIER  NOT NULL,
    contenido       NVARCHAR(MAX)     NOT NULL,
    creado_en       DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),
    editado_en      DATETIME2(0)      NULL,

    CONSTRAINT CP_Comentarios           PRIMARY KEY (comentario_id),
    CONSTRAINT FK_Comentarios_Tarea
        FOREIGN KEY (tarea_id)  REFERENCES tablero.Tareas(tarea_id)     ON DELETE CASCADE,
    CONSTRAINT FK_Comentarios_Autor
        FOREIGN KEY (autor_id)  REFERENCES nucleo.Usuarios(usuario_id)
);
GO

CREATE TABLE tablero.Actividad (
    actividad_id    UNIQUEIDENTIFIER  NOT NULL  DEFAULT NEWSEQUENTIALID(),
    tarea_id        UNIQUEIDENTIFIER  NOT NULL,
    actor_id        UNIQUEIDENTIFIER  NOT NULL,
    -- columna_cambiada | responsable_cambiado | prioridad_cambiada |
    -- titulo_cambiado  | etiqueta_agregada | etiqueta_removida |
    -- rama_vinculada | pr_vinculado | commit_detectado
    tipo_accion     NVARCHAR(50)      NOT NULL,
    valor_anterior  NVARCHAR(500)     NULL,
    valor_nuevo     NVARCHAR(500)     NULL,
    ocurrido_en     DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CP_Actividad             PRIMARY KEY (actividad_id),
    CONSTRAINT FK_Actividad_Tarea
        FOREIGN KEY (tarea_id)  REFERENCES tablero.Tareas(tarea_id)     ON DELETE CASCADE,
    CONSTRAINT FK_Actividad_Actor
        FOREIGN KEY (actor_id)  REFERENCES nucleo.Usuarios(usuario_id)
);
GO


-- ============================================================
--  DOMINIO: documentos — Wiki y Documentación
-- ============================================================

CREATE TABLE documentos.Paginas (
    pagina_id           UNIQUEIDENTIFIER  NOT NULL  DEFAULT NEWSEQUENTIALID(),
    proyecto_id         UNIQUEIDENTIFIER  NOT NULL,
    pagina_padre_id     UNIQUEIDENTIFIER  NULL,       -- NULL = página raíz del proyecto
    titulo              NVARCHAR(200)     NOT NULL,
    slug                NVARCHAR(200)     NOT NULL,
    contenido_md        NVARCHAR(MAX)     NULL,       -- Markdown sin procesar
    creado_por          UNIQUEIDENTIFIER  NOT NULL,
    editado_por         UNIQUEIDENTIFIER  NOT NULL,
    posicion            INT               NOT NULL  DEFAULT 0,
    creado_en           DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),
    actualizado_en      DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CP_Paginas                   PRIMARY KEY (pagina_id),
    CONSTRAINT UQ_Paginas_Slug              UNIQUE      (proyecto_id, slug),
    CONSTRAINT FK_Paginas_Proyecto
        FOREIGN KEY (proyecto_id)       REFERENCES nucleo.Proyectos(proyecto_id)  ON DELETE CASCADE,
    CONSTRAINT FK_Paginas_Padre
        FOREIGN KEY (pagina_padre_id)   REFERENCES documentos.Paginas(pagina_id),
    CONSTRAINT FK_Paginas_CreadoPor
        FOREIGN KEY (creado_por)        REFERENCES nucleo.Usuarios(usuario_id),
    CONSTRAINT FK_Paginas_EditadoPor
        FOREIGN KEY (editado_por)       REFERENCES nucleo.Usuarios(usuario_id),
    CONSTRAINT CK_Paginas_SinAutorreferencia
        CHECK (pagina_padre_id <> pagina_id)
);
GO

-- Vínculo entre páginas de documentación y tareas del tablero
CREATE TABLE documentos.VinculosPaginaTarea (
    pagina_id       UNIQUEIDENTIFIER  NOT NULL,
    tarea_id        UNIQUEIDENTIFIER  NOT NULL,
    vinculado_en    DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CP_VinculosPaginaTarea           PRIMARY KEY (pagina_id, tarea_id),
    CONSTRAINT FK_VinculosPaginaTarea_Pagina
        FOREIGN KEY (pagina_id) REFERENCES documentos.Paginas(pagina_id)  ON DELETE CASCADE,
    CONSTRAINT FK_VinculosPaginaTarea_Tarea
        FOREIGN KEY (tarea_id)  REFERENCES tablero.Tareas(tarea_id)       ON DELETE CASCADE
);
GO


-- ============================================================
--  DOMINIO: github — GitHub Bridge (SOLO LECTURA)
--  Ningún endpoint de DevManage escribe de vuelta a GitHub.
--  Estas tablas se alimentan exclusivamente desde:
--    1. Webhook de GitHub → POST /api/github/webhook
--    2. Sincronización inicial via GitHub REST API (scope: repo:read)
-- ============================================================

CREATE TABLE github.Repositorios (
    repositorio_id          UNIQUEIDENTIFIER  NOT NULL  DEFAULT NEWSEQUENTIALID(),
    proyecto_id             UNIQUEIDENTIFIER  NOT NULL,
    nombre_completo_github  NVARCHAR(200)     NOT NULL,  -- ej: andres-espitia/captu-app
    id_github               BIGINT            NOT NULL,  -- ID numérico de GitHub
    rama_principal          NVARCHAR(100)     NOT NULL  DEFAULT 'main',
    -- Secreto para validar firma HMAC-SHA256 del webhook entrante
    -- Almacenar cifrado; nunca exponer en respuestas de API
    secreto_webhook         NVARCHAR(256)     NULL,
    esta_activo             BIT               NOT NULL  DEFAULT 1,
    sincronizado_en         DATETIME2(0)      NULL,
    creado_en               DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CP_Repositorios              PRIMARY KEY (repositorio_id),
    CONSTRAINT UQ_Repositorios_IdGithub     UNIQUE      (id_github),
    CONSTRAINT UQ_Repositorios_Nombre       UNIQUE      (nombre_completo_github),
    CONSTRAINT FK_Repositorios_Proyecto
        FOREIGN KEY (proyecto_id) REFERENCES nucleo.Proyectos(proyecto_id) ON DELETE CASCADE
);
GO

-- Ramas detectadas vía webhook push o sincronización inicial
CREATE TABLE github.Ramas (
    rama_id             UNIQUEIDENTIFIER  NOT NULL  DEFAULT NEWSEQUENTIALID(),
    repositorio_id      UNIQUEIDENTIFIER  NOT NULL,
    nombre              NVARCHAR(255)     NOT NULL,
    sha_cabeza          CHAR(40)          NOT NULL,   -- SHA del commit más reciente
    esta_activa         BIT               NOT NULL  DEFAULT 1,
    ultimo_push_en      DATETIME2(0)      NULL,
    creado_en           DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CP_Ramas             PRIMARY KEY (rama_id),
    CONSTRAINT UQ_Ramas_Nombre      UNIQUE      (repositorio_id, nombre),
    CONSTRAINT FK_Ramas_Repositorio
        FOREIGN KEY (repositorio_id) REFERENCES github.Repositorios(repositorio_id) ON DELETE CASCADE
);
GO

-- Commits ingestados desde webhook o API de GitHub
-- Inmutables una vez insertados (no se actualizan, solo se insertan)
CREATE TABLE github.Confirmaciones (
    confirmacion_id         UNIQUEIDENTIFIER  NOT NULL  DEFAULT NEWSEQUENTIALID(),
    repositorio_id          UNIQUEIDENTIFIER  NOT NULL,
    rama_id                 UNIQUEIDENTIFIER  NULL,      -- NULL si la rama fue eliminada
    sha                     CHAR(40)          NOT NULL,
    mensaje                 NVARCHAR(2000)    NOT NULL,
    usuario_github_autor    NVARCHAR(100)     NULL,
    nombre_autor            NVARCHAR(100)     NULL,
    lineas_agregadas        INT               NOT NULL  DEFAULT 0,
    lineas_eliminadas       INT               NOT NULL  DEFAULT 0,
    archivos_cambiados      INT               NOT NULL  DEFAULT 0,
    confirmado_en           DATETIME2(0)      NOT NULL,
    sincronizado_en         DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CP_Confirmaciones            PRIMARY KEY (confirmacion_id),
    CONSTRAINT UQ_Confirmaciones_SHA        UNIQUE      (repositorio_id, sha),
    CONSTRAINT FK_Confirmaciones_Repo
        FOREIGN KEY (repositorio_id) REFERENCES github.Repositorios(repositorio_id),
    CONSTRAINT FK_Confirmaciones_Rama
        FOREIGN KEY (rama_id)        REFERENCES github.Ramas(rama_id)              ON DELETE SET NULL,
    CONSTRAINT CK_Confirmaciones_Agregadas
        CHECK (lineas_agregadas  >= 0),
    CONSTRAINT CK_Confirmaciones_Eliminadas
        CHECK (lineas_eliminadas >= 0)
);
GO

-- Archivos modificados por cada confirmación (del payload del webhook)
CREATE TABLE github.ArchivosConfirmacion (
    archivo_id          UNIQUEIDENTIFIER  NOT NULL  DEFAULT NEWSEQUENTIALID(),
    confirmacion_id     UNIQUEIDENTIFIER  NOT NULL,
    ruta_archivo        NVARCHAR(500)     NOT NULL,
    -- agregado | modificado | eliminado | renombrado
    estado              NVARCHAR(20)      NOT NULL,
    lineas_agregadas    INT               NOT NULL  DEFAULT 0,
    lineas_eliminadas   INT               NOT NULL  DEFAULT 0,
    ruta_anterior       NVARCHAR(500)     NULL,      -- solo si estado = renombrado

    CONSTRAINT CP_ArchivosConfirmacion          PRIMARY KEY (archivo_id),
    CONSTRAINT FK_ArchivosConfirmacion_Confirm
        FOREIGN KEY (confirmacion_id) REFERENCES github.Confirmaciones(confirmacion_id) ON DELETE CASCADE,
    CONSTRAINT CK_ArchivosConfirmacion_Estado
        CHECK (estado IN ('agregado', 'modificado', 'eliminado', 'renombrado'))
);
GO

-- Pull Requests: estado leído desde GitHub, nunca escrito de vuelta
CREATE TABLE github.SolicitudesIntegracion (
    solicitud_id            UNIQUEIDENTIFIER  NOT NULL  DEFAULT NEWSEQUENTIALID(),
    repositorio_id          UNIQUEIDENTIFIER  NOT NULL,
    numero_github           INT               NOT NULL,
    titulo                  NVARCHAR(500)     NOT NULL,
    -- abierta | cerrada | integrada
    estado                  NVARCHAR(20)      NOT NULL,
    rama_origen             NVARCHAR(255)     NOT NULL,
    rama_destino            NVARCHAR(255)     NOT NULL,
    usuario_github_autor    NVARCHAR(100)     NULL,
    resumen_descripcion     NVARCHAR(1000)    NULL,     -- primeros 1000 chars del body del PR
    total_confirmaciones    INT               NOT NULL  DEFAULT 0,
    total_comentarios       INT               NOT NULL  DEFAULT 0,
    lineas_agregadas        INT               NOT NULL  DEFAULT 0,
    lineas_eliminadas       INT               NOT NULL  DEFAULT 0,
    archivos_cambiados      INT               NOT NULL  DEFAULT 0,
    es_borrador             BIT               NOT NULL  DEFAULT 0,
    abierta_en              DATETIME2(0)      NOT NULL,
    integrada_en            DATETIME2(0)      NULL,
    cerrada_en              DATETIME2(0)      NULL,
    sincronizado_en         DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CP_SolicitudesIntegracion            PRIMARY KEY (solicitud_id),
    CONSTRAINT UQ_SolicitudesIntegracion_Numero     UNIQUE      (repositorio_id, numero_github),
    CONSTRAINT FK_SolicitudesIntegracion_Repo
        FOREIGN KEY (repositorio_id) REFERENCES github.Repositorios(repositorio_id) ON DELETE CASCADE,
    CONSTRAINT CK_SolicitudesIntegracion_Estado
        CHECK (estado IN ('abierta', 'cerrada', 'integrada'))
);
GO

-- Vínculo manual: el desarrollador asocia una tarea con una rama y/o PR desde DevManage
-- DevManage SOLO lee GitHub. Este vínculo vive únicamente en la BD de DevManage.
CREATE TABLE github.VinculosTareaGithub (
    vinculo_id      UNIQUEIDENTIFIER  NOT NULL  DEFAULT NEWSEQUENTIALID(),
    tarea_id        UNIQUEIDENTIFIER  NOT NULL,
    rama_id         UNIQUEIDENTIFIER  NULL,
    solicitud_id    UNIQUEIDENTIFIER  NULL,
    vinculado_por   UNIQUEIDENTIFIER  NOT NULL,   -- usuario que creó el vínculo en DevManage
    vinculado_en    DATETIME2(0)      NOT NULL  DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CP_VinculosTareaGithub           PRIMARY KEY (vinculo_id),
    CONSTRAINT FK_VinculosTareaGithub_Tarea
        FOREIGN KEY (tarea_id)      REFERENCES tablero.Tareas(tarea_id)                      ON DELETE CASCADE,
    CONSTRAINT FK_VinculosTareaGithub_Rama
        FOREIGN KEY (rama_id)       REFERENCES github.Ramas(rama_id)                         ON DELETE SET NULL,
    CONSTRAINT FK_VinculosTareaGithub_Solicitud
        FOREIGN KEY (solicitud_id)  REFERENCES github.SolicitudesIntegracion(solicitud_id)   ON DELETE NO ACTION,
    CONSTRAINT FK_VinculosTareaGithub_VinculadoPor
        FOREIGN KEY (vinculado_por) REFERENCES nucleo.Usuarios(usuario_id),
    CONSTRAINT CK_VinculosTareaGithub_AlMenosUno
        CHECK (rama_id IS NOT NULL OR solicitud_id IS NOT NULL)
);
GO


-- ============================================================
--  ÍNDICES — rendimiento de consultas frecuentes
-- ============================================================

-- nucleo
CREATE INDEX IX_Usuarios_Github            ON nucleo.Usuarios          (usuario_github)              WHERE usuario_github IS NOT NULL;
CREATE INDEX IX_MiembrosProyecto_Usuario   ON nucleo.MiembrosProyecto  (usuario_id);
CREATE INDEX IX_Proyectos_Equipo           ON nucleo.Proyectos         (equipo_id);

-- tablero
CREATE INDEX IX_Tareas_ProyectoColumna     ON tablero.Tareas     (proyecto_id, columna_id, posicion);
CREATE INDEX IX_Tareas_Responsable         ON tablero.Tareas     (responsable_id)                    WHERE responsable_id IS NOT NULL;
CREATE INDEX IX_Tareas_Epica               ON tablero.Tareas     (epica_id)                          WHERE epica_id IS NOT NULL;
CREATE INDEX IX_Tareas_Padre               ON tablero.Tareas     (tarea_padre_id)                    WHERE tarea_padre_id IS NOT NULL;
CREATE INDEX IX_Tareas_ActualizadoEn       ON tablero.Tareas     (proyecto_id, actualizado_en DESC);
CREATE INDEX IX_Actividad_TareaFecha       ON tablero.Actividad  (tarea_id, ocurrido_en DESC);
CREATE INDEX IX_Actividad_TipoAccion       ON tablero.Actividad  (tipo_accion, ocurrido_en DESC);
CREATE INDEX IX_Comentarios_Tarea          ON tablero.Comentarios (tarea_id, creado_en DESC);

-- documentos
CREATE INDEX IX_Paginas_Proyecto           ON documentos.Paginas (proyecto_id, posicion);
CREATE INDEX IX_Paginas_Padre              ON documentos.Paginas (pagina_padre_id)                   WHERE pagina_padre_id IS NOT NULL;
CREATE INDEX IX_Paginas_ActualizadoEn      ON documentos.Paginas (proyecto_id, actualizado_en DESC);

-- github
CREATE INDEX IX_Confirmaciones_RamaFecha   ON github.Confirmaciones        (rama_id, confirmado_en DESC);
CREATE INDEX IX_Confirmaciones_RepoFecha   ON github.Confirmaciones        (repositorio_id, confirmado_en DESC);
CREATE INDEX IX_Confirmaciones_Autor       ON github.Confirmaciones        (usuario_github_autor, confirmado_en DESC) WHERE usuario_github_autor IS NOT NULL;
CREATE INDEX IX_ArchivosConfirmacion_Conf  ON github.ArchivosConfirmacion  (confirmacion_id);
CREATE INDEX IX_ArchivosConfirmacion_Ruta  ON github.ArchivosConfirmacion  (ruta_archivo);
CREATE INDEX IX_SolicitudesInt_RepoEstado  ON github.SolicitudesIntegracion (repositorio_id, estado, abierta_en DESC);
CREATE INDEX IX_Ramas_Repo                 ON github.Ramas                 (repositorio_id)          WHERE esta_activa = 1;
CREATE INDEX IX_VinculosTarea_Tarea        ON github.VinculosTareaGithub   (tarea_id);
CREATE INDEX IX_VinculosTarea_Rama         ON github.VinculosTareaGithub   (rama_id)                 WHERE rama_id IS NOT NULL;
CREATE INDEX IX_VinculosTarea_Solicitud    ON github.VinculosTareaGithub   (solicitud_id)            WHERE solicitud_id IS NOT NULL;


-- ============================================================
--  VISTAS de uso común en la aplicación
-- ============================================================

-- Vista: progreso de proyecto basado en columnas marcadas como estado final
GO
CREATE OR ALTER VIEW tablero.vw_ProgresoPorProyecto AS
SELECT
    p.proyecto_id,
    p.nombre                                                                AS nombre_proyecto,
    COUNT(t.tarea_id)                                                       AS total_tareas,
    SUM(CASE WHEN c.es_estado_final = 1 THEN 1 ELSE 0 END)                 AS tareas_terminadas,
    CASE
        WHEN COUNT(t.tarea_id) = 0 THEN 0
        ELSE CAST(
            SUM(CASE WHEN c.es_estado_final = 1 THEN 1 ELSE 0 END) * 100.0
            / COUNT(t.tarea_id) AS DECIMAL(5,1))
    END                                                                     AS porcentaje_completado
FROM nucleo.Proyectos        p
LEFT JOIN tablero.Tareas     t  ON t.proyecto_id = p.proyecto_id
                               AND t.tarea_padre_id IS NULL   -- solo tareas raíz
LEFT JOIN tablero.Columnas   c  ON c.columna_id = t.columna_id
WHERE p.estado = 'activo'
GROUP BY p.proyecto_id, p.nombre;
GO

-- Vista: línea de tiempo de actividad GitHub por tarea (panel de detalle)
GO
CREATE OR ALTER VIEW github.vw_LineaDeTiempoPorTarea AS
SELECT
    v.tarea_id,
    'confirmacion'                  AS tipo_evento,
    c.sha                           AS referencia,
    c.mensaje                       AS descripcion,
    c.usuario_github_autor          AS actor_github,
    a.ruta_archivo                  AS archivo_afectado,
    c.lineas_agregadas,
    c.lineas_eliminadas,
    c.confirmado_en                 AS ocurrido_en,
    r.nombre                        AS nombre_rama,
    NULL                            AS numero_solicitud
FROM github.VinculosTareaGithub     v
JOIN github.Ramas                   r  ON r.rama_id         = v.rama_id
JOIN github.Confirmaciones          c  ON c.rama_id         = r.rama_id
LEFT JOIN github.ArchivosConfirmacion a ON a.confirmacion_id = c.confirmacion_id

UNION ALL

SELECT
    v.tarea_id,
    'solicitud_integracion'         AS tipo_evento,
    CAST(si.numero_github AS NVARCHAR) AS referencia,
    si.titulo                       AS descripcion,
    si.usuario_github_autor         AS actor_github,
    NULL                            AS archivo_afectado,
    si.lineas_agregadas,
    si.lineas_eliminadas,
    si.abierta_en                   AS ocurrido_en,
    si.rama_origen                  AS nombre_rama,
    si.numero_github                AS numero_solicitud
FROM github.VinculosTareaGithub     v
JOIN github.SolicitudesIntegracion  si ON si.solicitud_id = v.solicitud_id;
GO

-- Vista: mis tareas pendientes (filtro rápido en el tablero)
GO
CREATE OR ALTER VIEW tablero.vw_MisTareas AS
SELECT
    t.tarea_id,
    t.proyecto_id,
    t.titulo,
    t.tipo,
    t.prioridad,
    t.fecha_limite,
    t.responsable_id,
    c.nombre                                                            AS nombre_columna,
    c.es_estado_final,
    p.nombre                                                            AS nombre_proyecto,
    CASE WHEN v.vinculo_id IS NOT NULL THEN 1 ELSE 0 END               AS tiene_actividad_github
FROM tablero.Tareas                  t
JOIN tablero.Columnas                c   ON c.columna_id  = t.columna_id
JOIN nucleo.Proyectos                p   ON p.proyecto_id = t.proyecto_id
LEFT JOIN github.VinculosTareaGithub v   ON v.tarea_id    = t.tarea_id
WHERE c.es_estado_final = 0;
GO


-- ============================================================
--  PROCEDIMIENTOS ALMACENADOS de uso frecuente
-- ============================================================

-- PA: Mover tarea a otra columna y registrar la actividad
CREATE OR ALTER PROCEDURE tablero.pa_MoverTarea
    @tarea_id       UNIQUEIDENTIFIER,
    @nueva_columna  UNIQUEIDENTIFIER,
    @actor_id       UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @nombre_columna_anterior NVARCHAR(80),
                @nombre_columna_nueva    NVARCHAR(80);

        SELECT @nombre_columna_anterior = c.nombre
        FROM tablero.Tareas   t
        JOIN tablero.Columnas c ON c.columna_id = t.columna_id
        WHERE t.tarea_id = @tarea_id;

        SELECT @nombre_columna_nueva = nombre
        FROM tablero.Columnas
        WHERE columna_id = @nueva_columna;

        UPDATE tablero.Tareas
        SET    columna_id      = @nueva_columna,
               actualizado_en = SYSUTCDATETIME(),
               completado_en  = CASE
                   WHEN (SELECT es_estado_final FROM tablero.Columnas WHERE columna_id = @nueva_columna) = 1
                   THEN SYSUTCDATETIME()
                   ELSE NULL
               END
        WHERE  tarea_id = @tarea_id;

        INSERT INTO tablero.Actividad (tarea_id, actor_id, tipo_accion, valor_anterior, valor_nuevo)
        VALUES (@tarea_id, @actor_id, 'columna_cambiada', @nombre_columna_anterior, @nombre_columna_nueva);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PA: Ingestar confirmación desde webhook (idempotente vía MERGE)
CREATE OR ALTER PROCEDURE github.pa_InsertarConfirmacion
    @repositorio_id         UNIQUEIDENTIFIER,
    @rama_id                UNIQUEIDENTIFIER,
    @sha                    CHAR(40),
    @mensaje                NVARCHAR(2000),
    @usuario_github_autor   NVARCHAR(100),
    @nombre_autor           NVARCHAR(100),
    @lineas_agregadas       INT,
    @lineas_eliminadas      INT,
    @archivos_cambiados     INT,
    @confirmado_en          DATETIME2(0)
AS
BEGIN
    SET NOCOUNT ON;

    MERGE github.Confirmaciones AS destino
    USING (SELECT @sha AS sha, @repositorio_id AS repositorio_id) AS origen
        ON destino.sha = origen.sha AND destino.repositorio_id = origen.repositorio_id
    WHEN NOT MATCHED THEN
        INSERT (repositorio_id, rama_id, sha, mensaje, usuario_github_autor,
                nombre_autor, lineas_agregadas, lineas_eliminadas, archivos_cambiados, confirmado_en)
        VALUES (@repositorio_id, @rama_id, @sha, @mensaje, @usuario_github_autor,
                @nombre_autor, @lineas_agregadas, @lineas_eliminadas, @archivos_cambiados, @confirmado_en)
    WHEN MATCHED THEN
        UPDATE SET rama_id          = @rama_id,
                   sincronizado_en  = SYSUTCDATETIME();

    -- Registrar actividad en las tareas vinculadas a esta rama
    INSERT INTO tablero.Actividad (tarea_id, actor_id, tipo_accion, valor_anterior, valor_nuevo)
    SELECT v.tarea_id,
           u.usuario_id,
           'commit_detectado',
           NULL,
           @sha
    FROM github.VinculosTareaGithub v
    JOIN nucleo.Usuarios            u ON u.usuario_github = @usuario_github_autor
    WHERE v.rama_id = @rama_id
      AND NOT EXISTS (
          SELECT 1 FROM tablero.Actividad a
          WHERE a.tarea_id    = v.tarea_id
            AND a.tipo_accion = 'commit_detectado'
            AND a.valor_nuevo = @sha
      );
END;
GO

-- PA: Actualizar estado de solicitud de integración desde webhook
CREATE OR ALTER PROCEDURE github.pa_InsertarSolicitudIntegracion
    @repositorio_id         UNIQUEIDENTIFIER,
    @numero_github          INT,
    @titulo                 NVARCHAR(500),
    @estado                 NVARCHAR(20),
    @rama_origen            NVARCHAR(255),
    @rama_destino           NVARCHAR(255),
    @usuario_github_autor   NVARCHAR(100),
    @resumen_descripcion    NVARCHAR(1000),
    @total_confirmaciones   INT,
    @total_comentarios      INT,
    @lineas_agregadas       INT,
    @lineas_eliminadas      INT,
    @archivos_cambiados     INT,
    @es_borrador            BIT,
    @abierta_en             DATETIME2(0),
    @integrada_en           DATETIME2(0),
    @cerrada_en             DATETIME2(0)
AS
BEGIN
    SET NOCOUNT ON;

    MERGE github.SolicitudesIntegracion AS destino
    USING (SELECT @repositorio_id AS repositorio_id, @numero_github AS numero_github) AS origen
        ON destino.repositorio_id = origen.repositorio_id
       AND destino.numero_github  = origen.numero_github
    WHEN NOT MATCHED THEN
        INSERT (repositorio_id, numero_github, titulo, estado, rama_origen, rama_destino,
                usuario_github_autor, resumen_descripcion, total_confirmaciones, total_comentarios,
                lineas_agregadas, lineas_eliminadas, archivos_cambiados,
                es_borrador, abierta_en, integrada_en, cerrada_en)
        VALUES (@repositorio_id, @numero_github, @titulo, @estado, @rama_origen, @rama_destino,
                @usuario_github_autor, @resumen_descripcion, @total_confirmaciones, @total_comentarios,
                @lineas_agregadas, @lineas_eliminadas, @archivos_cambiados,
                @es_borrador, @abierta_en, @integrada_en, @cerrada_en)
    WHEN MATCHED THEN
        UPDATE SET titulo                = @titulo,
                   estado               = @estado,
                   total_confirmaciones = @total_confirmaciones,
                   total_comentarios    = @total_comentarios,
                   lineas_agregadas     = @lineas_agregadas,
                   lineas_eliminadas    = @lineas_eliminadas,
                   archivos_cambiados   = @archivos_cambiados,
                   es_borrador          = @es_borrador,
                   integrada_en         = @integrada_en,
                   cerrada_en           = @cerrada_en,
                   sincronizado_en      = SYSUTCDATETIME();
END;
GO

PRINT 'DevManage DDL en español ejecutado correctamente.';
GO

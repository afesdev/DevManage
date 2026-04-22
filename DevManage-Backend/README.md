# DevManage — Backend

API **NestJS** para DevManage: autenticación, tablero, GitHub (lectura + webhooks), documentos y salud de la aplicación.

## Documentación detallada del producto

Ver el README del monorepo: [`../README.md`](../README.md).

## Requisitos

- Node.js 20+ o Bun
- SQL Server con el esquema aplicado desde `Database/BASE DE DATOS.sql`

## Configuración

```bash
cp .env.example .env
```

Edita `.env` (SQL Server, `JWT_SECRET`, CORS, GitHub opcional). Detalle de variables: `../README.md#variables-de-entorno`.

## Comandos

```bash
bun install
bun run start:dev    # desarrollo con recarga
bun run build        # compilación
bun run start:prod   # producción (tras build)
```

## Documentación HTTP

Con el servidor en marcha:

- **Scalar**: `http://localhost:3000/docs`
- **OpenAPI JSON/UI**: `http://localhost:3000/openapi`
- **Health**: `http://localhost:3000/health` y `http://localhost:3000/health/db`

## Notas técnicas

- **Raw body** en `POST /github/webhook` para validar la firma `X-Hub-Signature-256`.
- Tokens de GitHub de usuario se almacenan cifrados (ver módulo `auth`).
- El esquema `github` en SQL refleja solo datos leídos de GitHub; no hay escritura hacia la API de GitHub desde DevManage.

import { registerAs } from '@nestjs/config';

const defaultCorsOrigins = ['http://localhost:5173'];

function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return defaultCorsOrigins;
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const appConfiguration = registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),
  /** Tras OAuth de GitHub, redirección del navegador al frontend */
  frontendUrl: (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
}));

export const databaseConfiguration = registerAs('database', () => ({
  server: process.env.DB_SERVER as string,
  port: parseInt(process.env.DB_PORT ?? '1433', 10),
  database: process.env.DB_NAME as string,
  user: process.env.DB_USER as string,
  password: process.env.DB_PASSWORD as string,
  options: {
    encrypt: process.env.DB_ENCRYPT !== 'false' && process.env.DB_ENCRYPT !== '0',
    trustServerCertificate:
      process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' ||
      process.env.DB_TRUST_SERVER_CERTIFICATE === '1',
    connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT_MS ?? '30000', 10),
  },
}));

export const authConfiguration = registerAs('auth', () => ({
  jwtSecret: process.env.JWT_SECRET ?? 'devmanage_jwt_secret_cambiar_en_produccion',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
}));

export const githubConfiguration = registerAs('github', () => ({
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? '',
  /** PAT del servidor (opcional); el token del usuario vía OAuth tiene prioridad al resolver repos. */
  apiToken: process.env.GITHUB_TOKEN ?? '',
  oauthClientId: process.env.GITHUB_CLIENT_ID ?? '',
  oauthClientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
  /** Debe coincidir con la GitHub OAuth App (ej. https://api.tudominio.com/auth/github/callback) */
  oauthCallbackUrl: process.env.GITHUB_OAUTH_CALLBACK_URL ?? '',
}));

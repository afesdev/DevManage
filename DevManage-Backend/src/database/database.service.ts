import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sql from 'mssql';

type DatabaseConfig = {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
  options: {
    encrypt: boolean;
    trustServerCertificate: boolean;
    connectTimeout: number;
  };
};

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: sql.ConnectionPool | null = null;
  private readonly logger = new Logger(DatabaseService.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const db = this.config.getOrThrow<DatabaseConfig>('database');
    this.logger.log(
      `Conectando a SQL Server ${db.server}:${db.port} / ${db.database} (encrypt=${db.options.encrypt}, trustServerCertificate=${db.options.trustServerCertificate}, timeout=${db.options.connectTimeout}ms)`,
    );
    this.pool = new sql.ConnectionPool({
      server: db.server,
      port: db.port,
      database: db.database,
      user: db.user,
      password: db.password,
      options: {
        encrypt: db.options.encrypt,
        trustServerCertificate: db.options.trustServerCertificate,
        connectTimeout: db.options.connectTimeout,
      },
    });
    await this.pool.connect();
    this.logger.log('Conexion a base de datos establecida correctamente');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      this.logger.log('Conexion a base de datos cerrada');
    }
  }

  private asegurarPool(): sql.ConnectionPool {
    if (!this.pool) {
      throw new Error('Pool de SQL Server no inicializado');
    }
    return this.pool;
  }

  private enlazarParametros(
    request: sql.Request,
    params?: Record<string, unknown>,
  ): void {
    if (!params) {
      return;
    }
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined) {
        request.input(key, sql.NVarChar(sql.MAX), null);
      } else if (typeof value === 'string') {
        request.input(key, sql.NVarChar, value);
      } else if (typeof value === 'number') {
        if (Number.isInteger(value)) {
          request.input(key, sql.Int, value);
        } else {
          request.input(key, sql.Float, value);
        }
      } else if (typeof value === 'boolean') {
        request.input(key, sql.Bit, value);
      } else if (value instanceof Date) {
        request.input(key, sql.DateTime2, value);
      } else {
        request.input(key, sql.NVarChar, JSON.stringify(value));
      }
    }
  }

  async query<T>(queryText: string, params?: Record<string, unknown>): Promise<T[]> {
    const pool = this.asegurarPool();
    const request = pool.request();
    this.enlazarParametros(request, params);
    const result = await request.query(queryText);
    return result.recordset as T[];
  }

  async queryOne<T>(
    queryText: string,
    params?: Record<string, unknown>,
  ): Promise<T | null> {
    const rows = await this.query<T>(queryText, params);
    return rows[0] ?? null;
  }

  async execute(
    procedureName: string,
    params?: Record<string, unknown>,
  ): Promise<sql.IProcedureResult<unknown>> {
    const pool = this.asegurarPool();
    const request = pool.request();
    this.enlazarParametros(request, params);
    return request.execute(procedureName);
  }
}

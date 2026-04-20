import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EnvVariables } from './env-variables';

export function validateEnv(config: Record<string, unknown>): EnvVariables {
  const validated = plainToInstance(EnvVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });
  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Variables de entorno inválidas: ${messages}`);
  }
  return validated;
}

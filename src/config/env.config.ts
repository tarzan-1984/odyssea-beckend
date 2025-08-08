import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  url:
    process.env.DATABASE_URL ||
    'postgresql://postgres:password@localhost:5432/odyssea_db?schema=public',
}));

export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiPrefix: process.env.API_PREFIX || 'api/v1',
}));

export const jwtConfig = registerAs('jwt', () => ({
  secret:
    process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',
}));

export const swaggerConfig = registerAs('swagger', () => ({
  title: process.env.SWAGGER_TITLE || 'Odyssea API',
  description:
    process.env.SWAGGER_DESCRIPTION || 'Odyssea Backend API Documentation',
  version: process.env.SWAGGER_VERSION || '1.0',
}));

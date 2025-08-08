import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL,
}));

export const appConfig = registerAs('app', () => ({
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
  nodeEnv: process.env.NODE_ENV,
  apiPrefix: process.env.API_PREFIX,
}));

export const jwtConfig = registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN,
}));

export const swaggerConfig = registerAs('swagger', () => ({
  title: process.env.SWAGGER_TITLE,
  description: process.env.SWAGGER_DESCRIPTION,
  version: process.env.SWAGGER_VERSION,
}));

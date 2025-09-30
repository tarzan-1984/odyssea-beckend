import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
	url: string | undefined;
}

export interface AppConfig {
	port: number | undefined;
	nodeEnv: string | undefined;
	apiPrefix: string | undefined;
	frontendUrl: string;
}

export interface JwtConfig {
	secret: string | undefined;
	expiresIn: string | undefined;
	refreshExpiresIn: string | undefined;
}

export interface SwaggerConfig {
	title: string | undefined;
	description: string | undefined;
	version: string | undefined;
}

export interface MailerConfig {
	host: string | undefined;
	port: number;
	secure: boolean;
	user: string | undefined;
	pass: string | undefined;
	from: string | undefined;
}

export interface ExternalApiConfig {
	apiKey: string | undefined;
}

export const databaseConfig = registerAs(
	'database',
	(): DatabaseConfig => ({
		url: process.env.DATABASE_URL,
	}),
);

export const appConfig = registerAs(
	'app',
	(): AppConfig => {
		// Temporary diagnostic logging
		console.log('DIAGNOSTIC - env.config.ts loading:');
		console.log('process.env.FRONTEND_URL:', process.env.FRONTEND_URL);
		console.log('process.env.NODE_ENV:', process.env.NODE_ENV);
		
		const config = {
			port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
			nodeEnv: process.env.NODE_ENV,
			apiPrefix: process.env.API_PREFIX,
			frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
		};
		
		console.log('Final app config:', config);
		return config;
	},
);

export const jwtConfig = registerAs(
	'jwt',
	(): JwtConfig => ({
		secret: process.env.JWT_SECRET,
		expiresIn: process.env.JWT_EXPIRES_IN,
		refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
	}),
);

export const swaggerConfig = registerAs(
	'swagger',
	(): SwaggerConfig => ({
		title: process.env.SWAGGER_TITLE,
		description: process.env.SWAGGER_DESCRIPTION,
		version: process.env.SWAGGER_VERSION,
	}),
);

export const mailerConfig = registerAs(
	'mailer',
	(): MailerConfig => ({
		host: process.env.SMTP_HOST,
		port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
		secure: process.env.SMTP_SECURE === 'true',
		user: process.env.SMTP_USER,
		pass: process.env.SMTP_PASS,
		from: process.env.SMTP_FROM || process.env.SMTP_USER,
	}),
);

export const externalApiConfig = registerAs(
	'externalApi',
	(): ExternalApiConfig => ({
		apiKey: process.env.EXTERNAL_API_KEY,
	}),
);

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
	// Validate critical environment variables before starting the app
	const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];
	const missingEnvVars = requiredEnvVars.filter(
		(envVar) => !process.env[envVar],
	);

	if (missingEnvVars.length > 0) {
		console.error('❌ Missing required environment variables:');
		missingEnvVars.forEach((envVar) => {
			console.error(`   - ${envVar}`);
		});
		console.error(
			'Please check your .env file or environment configuration.',
		);
		process.exit(1);
	}

	// Validate DATABASE_URL format
	const databaseUrl = process.env.DATABASE_URL;
	if (
		databaseUrl &&
		!databaseUrl.startsWith('postgresql://') &&
		!databaseUrl.startsWith('postgres://')
	) {
		console.error(
			'❌ Invalid DATABASE_URL format. Expected postgresql:// or postgres://',
		);
		console.error(`   Current value: ${databaseUrl.substring(0, 50)}...`);
		process.exit(1);
	}

	console.log('✅ Environment variables validated successfully');

	const app = await NestFactory.create(AppModule);
	const configService = app.get(ConfigService);

	// Enable WebSocket support
	app.useWebSocketAdapter(new IoAdapter(app));

	// Global prefix - remove /api prefix
	const apiPrefix = configService.get<string>('app.apiPrefix');
	if (apiPrefix) {
		app.setGlobalPrefix(apiPrefix);
	}

	// Global pipes
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
		}),
	);

	// Global filters
	app.useGlobalFilters(new HttpExceptionFilter());

	// Global interceptors
	app.useGlobalInterceptors(new TransformInterceptor());

	// CORS
	app.enableCors({
		origin: [
			/^https?:\/\/localhost:\d+$/,
			'https://odyssea-backend-ui.vercel.app',
			process.env.FRONTEND_URL || 'http://localhost:3000',
		],
		methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
		credentials: true,
	});

	// Swagger configuration
	const swaggerTitle = configService.get<string>('swagger.title');
	const swaggerDescription = configService.get<string>('swagger.description');
	const swaggerVersion = configService.get<string>('swagger.version');

	const config = new DocumentBuilder()
		.setTitle(swaggerTitle || 'Odyssea Backend API')
		.setDescription(
			swaggerDescription ||
				'Backend API for Odyssea user management system',
		)
		.setVersion(swaggerVersion || '1.0')
		.addBearerAuth()
		.build();

	const document = SwaggerModule.createDocument(app, config);
	SwaggerModule.setup('docs', app, document);

	// Start application
	const port = configService.get<number>('app.port') || 3000;
	await app.listen(port);

	console.log(`🚀 Application is running on: http://localhost:${port}`);
	console.log(`📚 Swagger documentation: http://localhost:${port}/docs`);
}

void bootstrap();

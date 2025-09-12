import {
	Injectable,
	CanActivate,
	ExecutionContext,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
	constructor(private readonly configService: ConfigService) {}

	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<Request>();
		const apiKey = (request.headers['x-api-key'] ||
			request.headers['api-key']) as string;

		// Get API key from environment variables
		const validApiKey =
			this.configService.get<string>('externalApi.apiKey');

		if (!validApiKey) {
			throw new UnauthorizedException('API key not configured');
		}

		if (!apiKey || apiKey !== validApiKey) {
			throw new UnauthorizedException('Invalid API key');
		}

		return true;
	}
}

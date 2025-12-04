import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/skip-auth.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
	constructor(private reflector: Reflector) {
		super();
	}

	canActivate(context: ExecutionContext) {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass(),
		]);
		const request = context.switchToHttp().getRequest();
		const path = request.url;
		
		if (isPublic) {
			console.log('🔓 [JwtAuthGuard] Public endpoint detected, skipping auth:', path);
			return true;
		}
		console.log('🔒 [JwtAuthGuard] Protected endpoint, checking auth:', path);
		return super.canActivate(context);
	}
}

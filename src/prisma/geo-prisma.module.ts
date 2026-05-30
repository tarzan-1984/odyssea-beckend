import { Global, Module } from '@nestjs/common';
import { GeoPrismaService } from './geo-prisma.service';

@Global()
@Module({
	providers: [GeoPrismaService],
	exports: [GeoPrismaService],
})
export class GeoPrismaModule {}

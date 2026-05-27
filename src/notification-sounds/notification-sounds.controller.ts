import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Req,
	UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationSoundsService } from './notification-sounds.service';
import { CreateNotificationSoundDto } from './dto/create-notification-sound.dto';

type AuthedRequest = {
	user: { id: string; email: string; role: string };
};

@ApiTags('Notification sounds')
@Controller('notification-sounds')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationSoundsController {
	constructor(private readonly service: NotificationSoundsService) {}

	@Get()
	@ApiOperation({ summary: 'List custom notification sounds for current user' })
	async list(@Req() req: AuthedRequest) {
		const rows = await this.service.listForUser(req.user.id);
		return rows.map(r => ({
			id: r.id,
			fileUrl: r.fileUrl,
			key: r.key,
			fileName: r.fileName,
			fileSize: r.fileSize,
			createdAt: r.createdAt,
		}));
	}

	@Post()
	@ApiOperation({ summary: 'Add custom notification sound for current user' })
	async create(@Req() req: AuthedRequest, @Body() dto: CreateNotificationSoundDto) {
		const lower = dto.fileName?.toLowerCase?.() || '';
		if (!lower.endsWith('.mp3') && !lower.endsWith('.wav')) {
			throw new BadRequestException('Only .mp3 or .wav files are allowed');
		}
		const row = await this.service.createForUser(req.user.id, dto);
		return {
			id: row.id,
			fileUrl: row.fileUrl,
			key: row.key,
			fileName: row.fileName,
			fileSize: row.fileSize,
			createdAt: row.createdAt,
		};
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete a custom notification sound for current user' })
	async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
		return this.service.deleteForUser(req.user.id, id);
	}
}


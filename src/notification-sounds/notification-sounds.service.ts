import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationSoundDto } from './dto/create-notification-sound.dto';
import { S3Service } from '../s3/s3.service';
const MAX_CUSTOM_SOUNDS_PER_USER = 5;

@Injectable()
export class NotificationSoundsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly s3: S3Service,
	) {}

	async listForUser(userId: string) {
		return this.prisma.userNotificationSound.findMany({
			where: { userId },
			orderBy: { createdAt: 'desc' },
		});
	}

	async createForUser(userId: string, dto: CreateNotificationSoundDto) {
		const count = await this.prisma.userNotificationSound.count({
			where: { userId },
		});
		if (count >= MAX_CUSTOM_SOUNDS_PER_USER) {
			throw new BadRequestException('You can upload up to 5 sounds');
		}

		return this.prisma.userNotificationSound.create({
			data: {
				userId,
				fileUrl: dto.fileUrl,
				key: dto.key,
				fileName: dto.fileName,
				fileSize: dto.fileSize,
			},
		});
	}

	async deleteForUser(userId: string, id: string) {
		const existing = await this.prisma.userNotificationSound.findFirst({
			where: { id, userId },
		});
		if (!existing) {
			throw new BadRequestException('Sound not found');
		}

		// Delete from object storage first, then remove DB row.
		// If storage deletion fails, keep DB row so user can retry.
		await this.s3.deleteObject(existing.key);
		await this.prisma.userNotificationSound.delete({ where: { id } });
		return { success: true };
	}
}

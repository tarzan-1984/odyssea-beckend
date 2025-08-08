import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all users
   */
  async findAll() {
    return this.prisma.user.findMany();
  }

  /**
   * Get user by id
   */
  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }
}

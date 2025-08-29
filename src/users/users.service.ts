import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRole, UserStatus } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new user (admin only)
   */
  async createUser(createUserDto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        profilePhoto: true,
        role: true,
        status: true,
        language: true,
        extension: true,
        vehicleType: true,
        vehicleCapacity: true,
        vehicleDimensions: true,
        vehicleModel: true,
        vehicleBrand: true,
        vehicleYear: true,
        distanceCoverage: true,
        hasPalletJack: true,
        hasLiftGate: true,
        hasCDL: true,
        hasTWIC: true,
        hasTSA: true,
        hasHazmatCert: true,
        hasTankerEndorsement: true,
        hasDolly: true,
        hasCanada: true,
        hasMexico: true,
        hasETracks: true,
        hasLoadBars: true,
        hasRamp: true,
        hasDockHigh: true,
        hasPPE: true,
        hasRealID: true,
        hasPrinter: true,
        hasSleeper: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      },
    });

    return user;
  }

  /**
   * Finds all users with pagination and filtering
   */
  async findAllUsers(
    page: number = 1,
    limit: number = 10,
    role?: UserRole,
    status?: UserStatus,
    search?: string,
    sort?: { [key: string]: 'asc' | 'desc' },
  ) {
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (role) {
      where.role = role;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: sort || { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          profilePhoto: true,
          location: true,
          vin: true,
          country: true,
          city: true,
          state: true,
          zip: true,
          role: true,
          vehicleBrand: true,
          vehicleModel: true,
          vehicleYear: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Transform users to match frontend format
    const transformedUsers = users.map((user) => ({
      id: user.id,
      user: {
        image: user.profilePhoto || '',
        name: `${user.firstName} ${user.lastName}`,
        role: user.role.toLowerCase(),
      },
      email: user.email,
      location: user.location || '',
      phone: user.phone || '',
      vin: user.vin || '',
      country: user.country || '',
      city: user.city || '',
      state: user.state || '',
      zip: user.zip || '',
      vehicle: {
        brand: user.vehicleBrand || '',
        model: user.vehicleModel || '',
        year: user.vehicleYear || '',
      },
    }));

    return {
      users: transformedUsers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Finds user by ID
   */
  async findUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        profilePhoto: true,
        role: true,
        status: true,
        language: true,
        extension: true,
        vehicleType: true,
        vehicleCapacity: true,
        vehicleDimensions: true,
        vehicleModel: true,
        vehicleBrand: true,
        vehicleYear: true,
        distanceCoverage: true,
        hasPalletJack: true,
        hasLiftGate: true,
        hasCDL: true,
        hasTWIC: true,
        hasTSA: true,
        hasHazmatCert: true,
        hasTankerEndorsement: true,
        hasDolly: true,
        hasCanada: true,
        hasMexico: true,
        hasETracks: true,
        hasLoadBars: true,
        hasRamp: true,
        hasDockHigh: true,
        hasPPE: true,
        hasRealID: true,
        hasPrinter: true,
        hasSleeper: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Updates user profile (only photo for drivers)
   */
  async updateUserProfile(userId: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Drivers can only update their photo
    if (user.role === UserRole.DRIVER) {
      if (
        Object.keys(updateUserDto).length > 1 ||
        !updateUserDto.profilePhoto
      ) {
        throw new BadRequestException(
          'Drivers can only update their profile photo',
        );
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateUserDto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        profilePhoto: true,
        role: true,
        status: true,
        language: true,
        extension: true,
        vehicleType: true,
        vehicleCapacity: true,
        vehicleDimensions: true,
        vehicleModel: true,
        vehicleBrand: true,
        vehicleYear: true,
        distanceCoverage: true,
        hasPalletJack: true,
        hasLiftGate: true,
        hasCDL: true,
        hasTWIC: true,
        hasTSA: true,
        hasHazmatCert: true,
        hasTankerEndorsement: true,
        hasDolly: true,
        hasCanada: true,
        hasMexico: true,
        hasETracks: true,
        hasLoadBars: true,
        hasRamp: true,
        hasDockHigh: true,
        hasPPE: true,
        hasRealID: true,
        hasPrinter: true,
        hasSleeper: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      },
    });

    return updatedUser;
  }

  /**
   * Updates user (admin only)
   */
  async updateUser(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        profilePhoto: true,
        role: true,
        status: true,
        language: true,
        extension: true,
        vehicleType: true,
        vehicleCapacity: true,
        vehicleDimensions: true,
        vehicleModel: true,
        vehicleBrand: true,
        vehicleYear: true,
        distanceCoverage: true,
        hasPalletJack: true,
        hasLiftGate: true,
        hasCDL: true,
        hasTWIC: true,
        hasTSA: true,
        hasHazmatCert: true,
        hasTankerEndorsement: true,
        hasDolly: true,
        hasCanada: true,
        hasMexico: true,
        hasETracks: true,
        hasLoadBars: true,
        hasRamp: true,
        hasDockHigh: true,
        hasPPE: true,
        hasRealID: true,
        hasPrinter: true,
        hasSleeper: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      },
    });

    return updatedUser;
  }

  /**
   * Deletes user (admin only)
   */
  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({
      where: { id },
    });

    return { message: 'User deleted successfully' };
  }

  /**
   * Changes user status (admin only)
   */
  async changeUserStatus(id: string, status: UserStatus) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
      },
    });

    return updatedUser;
  }
}

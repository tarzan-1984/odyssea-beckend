import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { ApiResponse as ApiResponseType } from '../../shared/types/common.types';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({
    status: 200,
    description: 'List of users',
  })
  async findAll(): Promise<ApiResponseType<any[]>> {
    const users = await this.usersService.findAll();
    return {
      success: true,
      data: users,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by id' })
  @ApiResponse({
    status: 200,
    description: 'User information',
  })
  async findById(@Param('id') id: string): Promise<ApiResponseType<any>> {
    const user = await this.usersService.findById(id);
    return {
      success: true,
      data: user,
    };
  }
}

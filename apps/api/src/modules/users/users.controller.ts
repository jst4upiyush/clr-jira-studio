import { Controller, Get } from '@nestjs/common';
import type { AppUsersResponse } from '@jira-idea-studio/shared';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  listUsers(): AppUsersResponse {
    return this.usersService.listUsers();
  }
}
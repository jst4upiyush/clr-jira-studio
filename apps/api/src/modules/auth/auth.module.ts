import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JiraModule } from '../jira/jira.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [JiraModule, UsersModule],
  controllers: [AuthController],
})
export class AuthModule {}

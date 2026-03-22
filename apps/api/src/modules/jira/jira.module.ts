import { Module } from '@nestjs/common';
import { JiraController } from './jira.controller';
import { JiraService } from './jira.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [JiraController],
  providers: [JiraService],
  exports: [JiraService],
})
export class JiraModule {}

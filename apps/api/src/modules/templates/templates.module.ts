import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { JiraModule } from '../jira/jira.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [JiraModule, UsersModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}

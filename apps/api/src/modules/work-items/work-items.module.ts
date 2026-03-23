import { Module } from '@nestjs/common';
import { WorkItemsController } from './work-items.controller';
import { WorkItemsService } from './work-items.service';
import { RolesModule } from '../roles/roles.module';
import { JiraModule } from '../jira/jira.module';
import { UsersModule } from '../users/users.module';
import { TemplatesModule } from '../templates/templates.module';
import { DraftGenerationService } from './draft-generation.service';

@Module({
  imports: [RolesModule, JiraModule, UsersModule, TemplatesModule],
  controllers: [WorkItemsController],
  providers: [WorkItemsService, DraftGenerationService],
})
export class WorkItemsModule {}

import { Module } from '@nestjs/common';
import { WorkItemsController } from './work-items.controller';
import { WorkItemsService } from './work-items.service';
import { RolesModule } from '../roles/roles.module';
import { JiraModule } from '../jira/jira.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [RolesModule, JiraModule, UsersModule],
  controllers: [WorkItemsController],
  providers: [WorkItemsService],
})
export class WorkItemsModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { TemplatesModule } from './templates/templates.module';
import { WorkItemsModule } from './work-items/work-items.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { JiraModule } from './jira/jira.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [AuthModule, ProjectsModule, TemplatesModule, WorkItemsModule, IngestionModule, JiraModule, RolesModule, UsersModule],
})
export class AppModule {}

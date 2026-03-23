import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import type { CreateTemplateRequest, UpdateTemplateRequest } from '@jira-idea-studio/shared';
import { TemplatesService } from './templates.service';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  listTemplates() {
    return this.templatesService.listTemplates();
  }

  @Get(':templateId')
  getTemplate(@Param('templateId') templateId: string) {
    return this.templatesService.getTemplate(templateId);
  }

  @Post()
  createTemplate(@Body() body: CreateTemplateRequest) {
    return this.templatesService.createTemplate(body);
  }

  @Put(':templateId')
  updateTemplate(@Param('templateId') templateId: string, @Body() body: UpdateTemplateRequest) {
    return this.templatesService.updateTemplate(templateId, body);
  }

  @Delete(':templateId')
  deleteTemplate(@Param('templateId') templateId: string) {
    return this.templatesService.deleteTemplate(templateId);
  }
}

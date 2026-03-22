import { Body, Controller, Get, Post } from '@nestjs/common';
import { TemplatesService } from './templates.service';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  listTemplates() {
    return this.templatesService.listTemplates();
  }

  @Post()
  createTemplate(@Body() body: unknown) {
    return {
      message: 'Template creation is scaffolded, not yet persisted.',
      body,
    };
  }
}

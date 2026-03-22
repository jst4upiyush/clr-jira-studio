import { Controller, Post } from '@nestjs/common';

@Controller('ingestion')
export class IngestionController {
  @Post('upload')
  uploadFile() {
    return {
      message: 'File ingestion endpoint scaffolded. Add multipart handling, validation, storage, and virus scanning.',
    };
  }
}

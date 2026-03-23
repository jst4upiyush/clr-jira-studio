import { Controller, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { IngestionService } from './ingestion.service';

type UploadedBinaryFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('extract')
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: 2 * 1024 * 1024, files: 10 } }))
  extractFiles(@UploadedFiles() files: UploadedBinaryFile[] = []) {
    return this.ingestionService.extractFiles(files);
  }

  @Post('upload')
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: 2 * 1024 * 1024, files: 10 } }))
  uploadFile(@UploadedFiles() files: UploadedBinaryFile[] = []) {
    return this.ingestionService.extractFiles(files);
  }
}

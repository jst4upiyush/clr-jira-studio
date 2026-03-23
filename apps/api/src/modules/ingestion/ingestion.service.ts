import { BadRequestException, Injectable } from '@nestjs/common';
import * as path from 'node:path';
import type { AttachmentExtractionResponse, FileDescriptor } from '@jira-idea-studio/shared';

type UploadedBinaryFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const SUPPORTED_TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/json',
  'application/ld+json',
]);
const SUPPORTED_TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.json']);
const MAX_EXTRACTED_TEXT_LENGTH = 12000;

@Injectable()
export class IngestionService {
  extractFiles(files: UploadedBinaryFile[]): AttachmentExtractionResponse {
    if (!files.length) {
      throw new BadRequestException('Attach at least one file to extract context.');
    }

    const extractedFiles = files.map((file, index) => this.extractFile(file, index));

    return {
      totalFiles: extractedFiles.length,
      supportedFiles: extractedFiles.filter((file) => file.extractionStatus === 'EXTRACTED').length,
      warnings: extractedFiles
        .map((file) => file.warning)
        .filter((warning): warning is string => Boolean(warning)),
      files: extractedFiles,
    };
  }

  private extractFile(file: UploadedBinaryFile, index: number): FileDescriptor {
    const extension = path.extname(file.originalname).toLowerCase();
    const descriptor: FileDescriptor = {
      id: `file-${Date.now()}-${index + 1}`,
      filename: file.originalname,
      mimeType: file.mimetype || 'application/octet-stream',
      sizeBytes: file.size,
    };

    if (!this.isSupportedTextFile(file.mimetype, extension)) {
      return {
        ...descriptor,
        extractionStatus: 'UNSUPPORTED',
        warning: `Unsupported attachment type '${file.mimetype || extension || 'unknown'}'. Upload plain text, markdown, or JSON files.`,
      };
    }

    const rawText = this.normalizeText(file.buffer.toString('utf8'));
    const formattedText = this.formatByType(rawText, file.mimetype, extension);
    if (!formattedText) {
      return {
        ...descriptor,
        extractionStatus: 'FAILED',
        warning: `Attachment '${file.originalname}' did not contain readable text.`,
      };
    }

    const extractedText = formattedText.slice(0, MAX_EXTRACTED_TEXT_LENGTH);
    const warning =
      formattedText.length > MAX_EXTRACTED_TEXT_LENGTH
        ? `Attachment '${file.originalname}' was truncated to ${MAX_EXTRACTED_TEXT_LENGTH} characters for draft generation.`
        : undefined;

    return {
      ...descriptor,
      extractionStatus: 'EXTRACTED',
      extractedText,
      excerpt: this.toExcerpt(extractedText),
      warning,
    };
  }

  private isSupportedTextFile(mimeType: string | undefined, extension: string) {
    const normalizedMimeType = mimeType?.toLowerCase();
    return Boolean(
      (normalizedMimeType && SUPPORTED_TEXT_MIME_TYPES.has(normalizedMimeType)) ||
        SUPPORTED_TEXT_EXTENSIONS.has(extension),
    );
  }

  private formatByType(text: string, mimeType: string | undefined, extension: string) {
    if (!text.trim()) {
      return '';
    }

    const normalizedMimeType = mimeType?.toLowerCase();
    if (normalizedMimeType === 'application/json' || normalizedMimeType === 'application/ld+json' || extension === '.json') {
      try {
        return JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        return text;
      }
    }

    return text;
  }

  private normalizeText(text: string) {
    return text.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim();
  }

  private toExcerpt(text: string) {
    const collapsed = text.replace(/\s+/g, ' ').trim();
    return collapsed.length > 280 ? `${collapsed.slice(0, 277)}...` : collapsed;
  }
}
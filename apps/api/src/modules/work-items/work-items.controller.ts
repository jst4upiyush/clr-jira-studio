import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { WorkItemsService } from './work-items.service';
import type { AcceptDraftSelection, CreateDraftRequest } from '@jira-idea-studio/shared';

@Controller('work-items')
export class WorkItemsController {
  constructor(private readonly workItemsService: WorkItemsService) {}

  @Post('drafts')
  createDraft(@Body() body: CreateDraftRequest) {
    return this.workItemsService.createDraft(body);
  }

  @Get('drafts/:draftId')
  getDraft(@Param('draftId') draftId: string) {
    return this.workItemsService.getDraft(draftId);
  }

  @Post('drafts/:draftId/submit')
  submitDraftSelection(@Param('draftId') draftId: string, @Body() body: AcceptDraftSelection) {
    return this.workItemsService.submitDraftSelection(draftId, body);
  }

  @Get('history')
  listHistory() {
    return this.workItemsService.listHistory();
  }
}

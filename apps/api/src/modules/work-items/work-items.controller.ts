import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { WorkItemsService } from './work-items.service';
import type { AcceptDraftSelection, CreateDraftRequest, RefineDraftRequest, UpdateDraftItemRequest } from '@jira-idea-studio/shared';

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

  @Patch('drafts/:draftId/items/:draftItemId')
  updateDraftItem(
    @Param('draftId') draftId: string,
    @Param('draftItemId') draftItemId: string,
    @Body() body: UpdateDraftItemRequest,
  ) {
    return this.workItemsService.updateDraftItem(draftId, draftItemId, body);
  }

  @Post('drafts/:draftId/refine')
  refineDraft(@Param('draftId') draftId: string, @Body() body: RefineDraftRequest) {
    return this.workItemsService.refineDraft(draftId, body);
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

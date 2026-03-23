'use client';

import type { DraftScope } from '@jira-idea-studio/shared';
import { Boxes, FolderKanban, GitBranchPlus, Layers3, Sparkles, Workflow } from 'lucide-react';
import { DRAFT_SCOPE_DETAILS } from '@/lib/draft-scopes';

const ICONS: Record<DraftScope, typeof FolderKanban> = {
  EPIC_ONLY: FolderKanban,
  EPIC_WITH_FEATURES_AND_STORIES: Workflow,
  EPIC_WITH_FEATURES: Layers3,
  FEATURE_ONLY: GitBranchPlus,
  FEATURE_WITH_STORIES: Boxes,
  STORY_ONLY: Sparkles,
};

type ScopeCardSelectorProps = {
  value: DraftScope;
  onChange: (scope: DraftScope) => void;
  disabled?: boolean;
};

export function ScopeCardSelector({ value, onChange, disabled = false }: ScopeCardSelectorProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {DRAFT_SCOPE_DETAILS.map((scope) => {
        const Icon = ICONS[scope.value];
        const selected = scope.value === value;

        return (
          <button
            key={scope.value}
            type="button"
            onClick={() => onChange(scope.value)}
            disabled={disabled}
            className={[
              'rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
              selected
                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">{scope.value.replaceAll('_', ' ')}</div>
                <div className="mt-1 text-base font-semibold">{scope.label}</div>
              </div>
              <Icon className="h-5 w-5 shrink-0" />
            </div>
            <p className={selected ? 'mt-3 text-sm text-slate-200' : 'mt-3 text-sm text-slate-600'}>{scope.description}</p>
            <div className={selected ? 'mt-3 text-xs text-slate-300' : 'mt-3 text-xs text-slate-500'}>{scope.creates}</div>
          </button>
        );
      })}
    </div>
  );
}

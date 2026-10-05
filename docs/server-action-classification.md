# Server Actionの分類表

`node scripts/check-action-errors.mjs --table`で生成（docs/action_errors_result.md 段階5）。

## 変換済み（ActionResult）（59件）

| アクション | ファイル | 使用箇所 |
|---|---|---|
| moveFlowStep | business-flow.ts | components/domain/business-flow/SwimlaneDiagramEditor.tsx |
| checkDuplicateDocument | documents.ts | components/domain/document-upload-zone.tsx |
| registerUploadedDocument | documents.ts | components/domain/document-upload-zone.tsx |
| createKpiNode | kpi-tree.ts | components/domain/kpi-tree/KpiDetailPane.tsx<br>components/domain/kpi-tree/KpiTreePane.tsx |
| updateKpiNodeField | kpi-tree.ts | components/domain/kpi-tree/KpiDetailPane.tsx |
| confirmKpiNode | kpi-tree.ts | components/domain/kpi-tree/KpiTree.tsx |
| suggestKpiCandidates | kpi-tree.ts | components/domain/kpi-tree/KpiCandidatePanel.tsx |
| adoptKpiCandidate | kpi-tree.ts | components/domain/kpi-tree/KpiCandidatePanel.tsx |
| moveKpiNodeUpDown | kpi-tree.ts | components/domain/kpi-tree/KpiDetailPane.tsx |
| changeKpiNodeLevel | kpi-tree.ts | components/domain/kpi-tree/KpiDetailPane.tsx |
| duplicateKpiNode | kpi-tree.ts | components/domain/kpi-tree/KpiDetailPane.tsx |
| deleteKpiNode | kpi-tree.ts | components/domain/kpi-tree/KpiDetailPane.tsx |
| adoptMasterAspect | nonfunctional.ts | components/domain/nonfunctional-checklist/NonfunctionalScreen.tsx |
| reactivateAspect | nonfunctional.ts | components/domain/nonfunctional-checklist/NonfunctionalScreen.tsx |
| createCustomAspect | nonfunctional.ts | components/domain/nonfunctional-checklist/NonfunctionalScreen.tsx |
| unadoptAspect | nonfunctional.ts | components/domain/nonfunctional-checklist/AspectDetailPane.tsx |
| updateAspectPolicy | nonfunctional.ts | components/domain/nonfunctional-checklist/AspectDetailPane.tsx |
| addCheckItem | nonfunctional.ts | components/domain/nonfunctional-checklist/AspectCandidatePanel.tsx<br>components/domain/nonfunctional-checklist/AspectDetailPane.tsx |
| importMasterCheckItems | nonfunctional.ts | components/domain/nonfunctional-checklist/AspectDetailPane.tsx |
| setCheckItemJudgement | nonfunctional.ts | components/domain/nonfunctional-checklist/AspectDetailPane.tsx |
| deleteCheckItem | nonfunctional.ts | components/domain/nonfunctional-checklist/AspectDetailPane.tsx |
| confirmAspect | nonfunctional.ts | components/domain/nonfunctional-checklist/AspectDetailPane.tsx |
| bulkSetUnknownToNo | nonfunctional.ts | components/domain/nonfunctional-checklist/AspectDetailPane.tsx |
| reorderAspect | nonfunctional.ts | components/domain/nonfunctional-checklist/NonfunctionalScreen.tsx<br>lib/nonfunctional/derive.ts |
| reorderCheckItem | nonfunctional.ts | components/domain/nonfunctional-checklist/AspectDetailPane.tsx<br>components/domain/nonfunctional-checklist/NonfunctionalScreen.tsx<br>lib/nonfunctional/derive.ts |
| moveCheckItem | nonfunctional.ts | components/domain/nonfunctional-checklist/AspectDetailPane.tsx |
| suggestNonfunctionalCandidates | nonfunctional.ts | components/domain/nonfunctional-checklist/AspectCandidatePanel.tsx |
| updateOrganization | organizations.ts | **未使用** |
| createPhase | progress-tasks.ts | components/domain/progress/ProgressChart.tsx |
| createTask | progress-tasks.ts | components/domain/progress/ProgressChart.tsx |
| updateProgressTaskField | progress-tasks.ts | components/domain/progress/ProgressDetailPanel.tsx |
| deleteProgressTask | progress-tasks.ts | components/domain/progress/ProgressDetailPanel.tsx |
| setPredecessor | progress-tasks.ts | components/domain/progress/ProgressDetailPanel.tsx |
| shiftTaskDates | progress-tasks.ts | components/domain/progress/ProgressChart.tsx |
| moveItemToGroup | requirement-items.ts | components/domain/requirement-table/RequirementTable.tsx |
| reorderGroups | requirement-items.ts | components/domain/requirement-table/RequirementTable.tsx |
| updateRequirementItemContent | requirement-items.ts | components/domain/requirement-table/RequirementCard.tsx |
| markAsExceptionApproved | requirement-items.ts | components/domain/requirement-table/RequirementCard.tsx |
| markAsRejected | requirement-items.ts | components/domain/requirement-table/RequirementCard.tsx |
| deleteRequirementItem | requirement-items.ts | components/domain/requirement-table/RequirementCard.tsx |
| bulkConfirm | requirement-items.ts | components/domain/requirement-table/RequirementTable.tsx |
| bulkReject | requirement-items.ts | components/domain/requirement-table/RequirementTable.tsx |
| bulkSetCategory | requirement-items.ts | components/domain/requirement-table/RequirementTable.tsx |
| updateRequirementItemStatus | requirement-items.ts | components/domain/requirement-table/RequirementCard.tsx<br>components/domain/requirement-table/RequirementGroup.tsx |
| generateScreenFlowSuggestions | screen-flow-suggestions.ts | components/domain/screen-flow/ScreenFlowScreen.tsx |
| adoptScreenSuggestion | screen-flow-suggestions.ts | components/domain/screen-flow/ScreenFlowPanel.tsx |
| rejectScreenSuggestion | screen-flow-suggestions.ts | components/domain/screen-flow/ScreenFlowScreen.tsx |
| adoptAllScreenSuggestions | screen-flow-suggestions.ts | components/domain/screen-flow/ScreenFlowScreen.tsx |
| rejectAllScreenSuggestions | screen-flow-suggestions.ts | components/domain/screen-flow/ScreenFlowScreen.tsx |
| moveScreenNode | screen-transition.ts | components/domain/screen-flow/ScreenFlowScreen.tsx |
| addScreenNode | screen-transition.ts | components/domain/screen-flow/ScreenFlowPanel.tsx |
| renameScreenNode | screen-transition.ts | components/domain/screen-flow/ScreenFlowPanel.tsx |
| removeScreenNode | screen-transition.ts | components/domain/screen-flow/ScreenFlowScreen.tsx |
| linkScreenFunction | screen-transition.ts | components/domain/screen-flow/ScreenFlowPanel.tsx |
| addScreenTransition | screen-transition.ts | components/domain/screen-flow/ScreenFlowPanel.tsx<br>components/domain/screen-flow/ScreenFlowScreen.tsx |
| updateScreenTransitionLabel | screen-transition.ts | components/domain/screen-flow/ScreenFlowPanel.tsx |
| removeScreenTransition | screen-transition.ts | components/domain/screen-flow/ScreenFlowPanel.tsx<br>components/domain/screen-flow/ScreenFlowScreen.tsx |
| moveScreenNodes | screen-transition.ts | components/domain/screen-flow/ScreenFlowScreen.tsx |
| confirmScreenNode | screen-transition.ts | components/domain/screen-flow/ScreenFlowPanel.tsx |

## 変換済み（フォーム：FormActionState）（16件）

| アクション | ファイル | 使用箇所 |
|---|---|---|
| addProjectMemberByEmail | admin-users.ts | app/(app)/projects/[id]/members/page.tsx |
| runAmbiguousCheck | ambiguous-check.ts | app/(app)/projects/[id]/chapters/[chapterNo]/page.tsx |
| createBaseline | baseline.ts | app/(app)/projects/[id]/baseline/page.tsx |
| addFlowStep | business-flow.ts | app/(app)/projects/[id]/business-flow/page.tsx |
| deleteFlowStep | business-flow.ts | app/(app)/projects/[id]/business-flow/page.tsx |
| raiseChangeRequest | change-detection.ts | app/(app)/projects/[id]/changes/page.tsx |
| copyReferenceItem | cross-project-reference.ts | app/(app)/projects/[id]/chapters/[chapterNo]/cross-reference/page.tsx |
| deleteEffortLog | effort-logs.ts | app/(app)/projects/[id]/effort/page.tsx |
| proposeFunctionalRequirements | flow-diff.ts | app/(app)/projects/[id]/business-flow/diff/page.tsx |
| createOrganization | organizations.ts | app/(app)/organizations/page.tsx |
| toggleCrossProjectReference | project-settings.ts | app/(app)/projects/[id]/settings/page.tsx |
| updateSelectedChapters | project-settings.ts | app/(app)/projects/[id]/settings/page.tsx |
| createProject | projects.ts | app/(app)/projects/new/page.tsx |
| deleteProject | projects.ts | components/domain/project-danger-zone.tsx |
| createRequirementItem | requirement-items.ts | app/(app)/projects/[id]/chapters/[chapterNo]/page.tsx |
| updateUserRole | user-management.ts | app/(app)/admin/users/page.tsx |

## 戻り値方式（{error}）（13件）

| アクション | ファイル | 使用箇所 |
|---|---|---|
| createPartnerAccount | admin-users.ts | app/(app)/admin/partners/page.tsx |
| generateBusinessFlowDraft | ai-draft-business-flow.ts | app/(app)/projects/[id]/business-flow/page.tsx |
| generateKpiDraft | ai-draft-kpi.ts | app/(app)/projects/[id]/chapters/4/page.tsx |
| generateDraft | ai-draft.ts | app/(app)/projects/[id]/chapters/[chapterNo]/page.tsx<br>components/domain/bulk-generate-zone.tsx |
| runAmbiguousCheckAI | ambiguous-check.ts | app/(app)/projects/[id]/chapters/[chapterNo]/page.tsx |
| reclassifyDocument | documents.ts | app/(app)/projects/[id]/documents/page.tsx |
| createEffortLog | effort-logs.ts | app/(app)/projects/[id]/effort/page.tsx |
| suggestPlatformFeature | platform-suggestion.ts | components/domain/requirement-table/RequirementCard.tsx |
| createUserAccount | user-management.ts | app/(app)/admin/users/page.tsx |
| updateFlowNode | workflow-builder.ts | components/domain/workflow-builder/NodeEditPanel.tsx |
| insertWorkflowNodeAfter | workflow-builder.ts | app/(app)/projects/[id]/business-flow/builder/page.tsx<br>components/domain/workflow-builder/SwimlaneCanvas.tsx<br>components/domain/workflow-builder/WorkflowBuilderClient.tsx |
| deleteWorkflowNode | workflow-builder.ts | components/domain/workflow-builder/NodeEditPanel.tsx |
| deleteConditionNode | workflow-builder.ts | components/domain/workflow-builder/NodeEditPanel.tsx<br>components/domain/workflow-builder/WorkflowBuilderClient.tsx |

## 読み取り系（34件）

| アクション | ファイル | 使用箇所 |
|---|---|---|
| getActiveBaseline | baseline.ts | app/(app)/projects/[id]/baseline/page.tsx |
| listFlowSteps | business-flow.ts | app/(app)/projects/[id]/business-flow/page.tsx |
| listFlowEdges | business-flow.ts | app/(app)/projects/[id]/business-flow/page.tsx |
| getDiffFromBaseline | change-detection.ts | app/(app)/projects/[id]/changes/page.tsx |
| listChangeRequests | change-detection.ts | app/(app)/projects/[id]/changes/page.tsx |
| checkOrphanItems | consistency.ts | app/(app)/projects/[id]/chapters/[chapterNo]/consistency/page.tsx<br>app/(app)/projects/[id]/consistency/page.tsx |
| checkUnreflectedSteps | consistency.ts | app/(app)/projects/[id]/consistency/page.tsx |
| listCrossProjectReferences | cross-project-reference.ts | app/(app)/projects/[id]/chapters/[chapterNo]/cross-reference/page.tsx |
| listDocuments | documents.ts | app/(app)/projects/[id]/documents/page.tsx |
| listEffortLogs | effort-logs.ts | app/(app)/projects/[id]/effort/page.tsx |
| getFlowDiff | flow-diff.ts | app/(app)/projects/[id]/business-flow/diff/page.tsx |
| listKpiTree | kpi-tree.ts | app/(app)/projects/[id]/chapters/4/page.tsx<br>components/domain/kpi-tree/KpiTree.tsx |
| listAspectMaster | nonfunctional.ts | app/(app)/projects/[id]/chapters/10/page.tsx |
| listNonfunctionalNodes | nonfunctional.ts | app/(app)/projects/[id]/chapters/10/page.tsx |
| listOrganizationsWithProjectCount | organizations.ts | app/(app)/organizations/page.tsx |
| listProgressTasks | progress-tasks.ts | app/(app)/projects/[id]/chapters/15/page.tsx |
| getProjectOverview | project-overview.ts | app/api/projects/[id]/export-pptx/route.ts |
| getProjectTopData | project-top.ts | app/(app)/projects/[id]/page.tsx |
| getUserDisplayNames | project-top.ts | app/(app)/projects/[id]/page.tsx |
| listProjectsForList | projects.ts | app/(app)/projects/page.tsx |
| listOrganizations | projects.ts | app/(app)/projects/new/page.tsx |
| getProjectDetail | projects.ts | app/(app)/projects/[id]/members/page.tsx |
| listProjectMembers | projects.ts | app/(app)/projects/[id]/chapters/15/page.tsx<br>app/(app)/projects/[id]/members/page.tsx |
| getChapterStats | readiness.ts | lib/project-data.ts |
| getProjectProgress | readiness.ts | 内部のみ（project-overview.ts） |
| getAmbiguousCounts | readiness.ts | lib/project-data.ts |
| getReadinessSummary | readiness.ts | app/(app)/projects/[id]/readiness/page.tsx |
| listColumnDefs | requirement-items.ts | app/(app)/projects/[id]/chapters/[chapterNo]/page.tsx<br>app/api/projects/[id]/export-pptx/route.ts |
| listRequirementItems | requirement-items.ts | app/(app)/projects/[id]/chapters/9/screen-transitions/page.tsx<br>app/(app)/projects/[id]/chapters/9/screens/page.tsx<br>app/(app)/projects/[id]/chapters/[chapterNo]/page.tsx |
| listScreenSuggestions | screen-flow-suggestions.ts | app/(app)/projects/[id]/chapters/9/screen-transitions/page.tsx |
| listScreenNodes | screen-transition.ts | app/(app)/projects/[id]/chapters/9/screen-transitions/page.tsx |
| listScreenEdges | screen-transition.ts | app/(app)/projects/[id]/chapters/9/screen-transitions/page.tsx |
| listAllUsers | user-management.ts | app/(app)/admin/users/page.tsx |
| listWorkflowNodes | workflow-builder.ts | app/(app)/projects/[id]/business-flow/builder/page.tsx<br>app/api/projects/[id]/export-procedure-csv/route.ts |

## 対象外（ログイン系）（4件）

| アクション | ファイル | 使用箇所 |
|---|---|---|
| signInWithPassword | auth.ts | app/login/page.tsx |
| updatePassword | auth.ts | app/reset-password/page.tsx |
| signInWithGoogle | auth.ts | app/login/page.tsx |
| signOut | auth.ts | components/layout/app-header.tsx |

## 内部用（他のアクションから呼ぶ書き込み処理）（1件）

| アクション | ファイル | 使用箇所 |
|---|---|---|
| regenerateEdges | business-flow.ts | 内部のみ（ai-draft-business-flow.ts・workflow-builder.ts） |

## 未使用のexport（1件）

- organizations.ts#updateOrganization（変換済み（ActionResult））

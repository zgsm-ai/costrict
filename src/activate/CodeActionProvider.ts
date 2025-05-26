import * as vscode from "vscode"
import { EditorUtils } from "../integrations/editor/EditorUtils"
import { CodeActionName, CodeActionId } from "../schemas"
import { getCodeActionCommand } from "../utils/commands"

export const ACTION_NAMES = {
	EXPLAIN: "Shenma: Explain Code",
	FIX: "Shenma: Fix Code",
	FIX_LOGIC: "Shenma: Fix Logic",
	IMPROVE: "Shenma: Improve Code",
	ADD_TO_CONTEXT: "Shenma: Add to Context",
	NEW_TASK: "Shenma: New Task",

	// right menu and quick menu
	ZGSM_EXPLAIN: "Shenma: Explain Code",
	ZGSM_ADD_COMMENT: "Shenma: Add Comment",
	ZGSM_CODE_REVIEW: "Shenma: Code Review",
	ZGSM_ADD_DEBUG_CODE: "Shenma: Add Debug Code",
	ZGSM_ADD_STRONG_CODE: "Shenma: Add Strong Code",
	ZGSM_SIMPLIFY_CODE: "Shenma: Simplify Code",
	ZGSM_PERFORMANCE: "Shenma: Performance Optimization",
	ZGSM_ADD_TEST: "Shenma: Add Unit test",
} as const

export const COMMAND_IDS = {
	EXPLAIN: "explainCode",
	FIX: "fixCode",
	IMPROVE: "improveCode",
	ADD_TO_CONTEXT: "addToContext",
	NEW_TASK: "newTask",
	ZGSM_EXPLAIN: "explain",
	ZGSM_ADD_COMMENT: "addComment",
	ZGSM_CODE_REVIEW: "codeReview",
	ZGSM_ADD_DEBUG_CODE: "addDebugCode",
	ZGSM_ADD_STRONG_CODE: "addStrongerCode",
	ZGSM_SIMPLIFY_CODE: "simplifyCode",
	ZGSM_PERFORMANCE: "performanceOptimization",
} as const

export const ACTION_TITLES: Record<CodeActionName, string> = {
	EXPLAIN: "Explain with Shenma",
	FIX: "Fix with Shenma",
	IMPROVE: "Improve with Shenma",
	ADD_TO_CONTEXT: "Add to Shenma",
	NEW_TASK: "New Shenma Task",

	ZGSM_EXPLAIN: "Shenma: ZGSM_EXPLAIN",
	ZGSM_ADD_COMMENT: "Shenma: ZGSM_ADD_COMMENT",
	ZGSM_CODE_REVIEW: "Shenma: ZGSM_CODE_REVIEW",
	ZGSM_ADD_DEBUG_CODE: "Shenma: ZGSM_ADD_DEBUG_CODE",
	ZGSM_ADD_STRONG_CODE: "Shenma: ZGSM_ADD_STRONG_CODE",
	ZGSM_SIMPLIFY_CODE: "Shenma: ZGSM_SIMPLIFY_CODE",
	ZGSM_PERFORMANCE: "Shenma: ZGSM_PERFORMANCE",
} as const

export class CodeActionProvider implements vscode.CodeActionProvider {
	public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.QuickFix,
		vscode.CodeActionKind.RefactorRewrite,
	]

	private createAction(
		title: string,
		kind: vscode.CodeActionKind,
		command: CodeActionId,
		args: any[],
	): vscode.CodeAction {
		const action = new vscode.CodeAction(title, kind)
		action.command = { command: getCodeActionCommand(command), title, arguments: args }
		return action
	}

	public provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext,
	): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
		try {
			const effectiveRange = EditorUtils.getEffectiveRange(document, range)

			if (!effectiveRange) {
				return []
			}

			const filePath = EditorUtils.getFilePath(document)
			const actions: vscode.CodeAction[] = []

			actions.push(
				this.createAction(
					ACTION_TITLES.ADD_TO_CONTEXT,
					vscode.CodeActionKind.QuickFix,
					COMMAND_IDS.ADD_TO_CONTEXT as CodeActionId,
					[
						filePath,
						effectiveRange.text,
						effectiveRange.range.start.line + 1,
						effectiveRange.range.end.line + 1,
					],
				),
			)

			if (context.diagnostics.length > 0) {
				const relevantDiagnostics = context.diagnostics.filter((d) =>
					EditorUtils.hasIntersectingRange(effectiveRange.range, d.range),
				)

				if (relevantDiagnostics.length > 0) {
					actions.push(
						this.createAction(
							ACTION_TITLES.FIX,
							vscode.CodeActionKind.QuickFix,
							COMMAND_IDS.FIX as CodeActionId,
							[
								filePath,
								effectiveRange.text,
								effectiveRange.range.start.line + 1,
								effectiveRange.range.end.line + 1,
								relevantDiagnostics.map(EditorUtils.createDiagnosticData),
							],
						),
					)
				}
			} else {
				actions.push(
					this.createAction(
						ACTION_TITLES.EXPLAIN,
						vscode.CodeActionKind.QuickFix,
						COMMAND_IDS.EXPLAIN as CodeActionId,
						[
							filePath,
							effectiveRange.text,
							effectiveRange.range.start.line + 1,
							effectiveRange.range.end.line + 1,
						],
					),
				)

				actions.push(
					this.createAction(
						ACTION_TITLES.IMPROVE,
						vscode.CodeActionKind.QuickFix,
						COMMAND_IDS.IMPROVE as CodeActionId,
						[
							filePath,
							effectiveRange.text,
							effectiveRange.range.start.line + 1,
							effectiveRange.range.end.line + 1,
						],
					),
				)
			}

			return actions
		} catch (error) {
			console.error("Error providing code actions:", error)
			return []
		}
	}
}

import * as vscode from "vscode"
import { EditorUtils } from "../integrations/editor/EditorUtils"

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
	EXPLAIN: "vscode-zgsm.explainCode",
	FIX: "vscode-zgsm.fixCode",
	IMPROVE: "vscode-zgsm.improveCode",
	ADD_TO_CONTEXT: "vscode-zgsm.addToContext",
	NEW_TASK: "vscode-zgsm.newTask",
	ZGSM_EXPLAIN: "vscode-zgsm.explain",
	ZGSM_ADD_COMMENT: "vscode-zgsm.addComment",
	ZGSM_CODE_REVIEW: "vscode-zgsm.codeReview",
	ZGSM_ADD_DEBUG_CODE: "vscode-zgsm.addDebugCode",
	ZGSM_ADD_STRONG_CODE: "vscode-zgsm.addStrongerCode",
	ZGSM_SIMPLIFY_CODE: "vscode-zgsm.simplifyCode",
	ZGSM_PERFORMANCE: "vscode-zgsm.performanceOptimization",
} as const

export type CodeActionName = "EXPLAIN" | "FIX" | "IMPROVE" | "ADD_TO_CONTEXT" | "NEW_TASK"
| "ZGSM_EXPLAIN"
| "ZGSM_ADD_COMMENT"
| "ZGSM_CODE_REVIEW"
| "ZGSM_ADD_DEBUG_CODE"
| "ZGSM_ADD_STRONG_CODE"
| "ZGSM_SIMPLIFY_CODE"
| "ZGSM_PERFORMANCE"

export type CodeActionId =
	| "vscode-zgsm.explainCode"
	| "vscode-zgsm.fixCode"
	| "vscode-zgsm.improveCode"
	| "vscode-zgsm.addToContext"
	| "vscode-zgsm.newTask"
	| "vscode-zgsm.explain"
	| "vscode-zgsm.addComment"
	| "vscode-zgsm.codeReview"
	| "vscode-zgsm.addDebugCode"
	| "vscode-zgsm.addStrongerCode"
	| "vscode-zgsm.simplifyCode"
	| "vscode-zgsm.performanceOptimization"

export const ACTION_TITLES: Record<CodeActionName, string> = {
	EXPLAIN: "Explain with Shenma",
	FIX: "Fix with Shenma",
	IMPROVE: "Improve with Shenma",
	ADD_TO_CONTEXT: "Add to Shenma",
	NEW_TASK: "New Shenma Task",

	// todo: @monkeydluffy6017 Pull Request #114
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
		action.command = { command, title, arguments: args }
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
					COMMAND_IDS.ADD_TO_CONTEXT,
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
						this.createAction(ACTION_TITLES.FIX, vscode.CodeActionKind.QuickFix, COMMAND_IDS.FIX, [
							filePath,
							effectiveRange.text,
							effectiveRange.range.start.line + 1,
							effectiveRange.range.end.line + 1,
							relevantDiagnostics.map(EditorUtils.createDiagnosticData),
						]),
					)
				}
			} else {
				actions.push(
					this.createAction(ACTION_TITLES.EXPLAIN, vscode.CodeActionKind.QuickFix, COMMAND_IDS.EXPLAIN, [
						filePath,
						effectiveRange.text,
						effectiveRange.range.start.line + 1,
						effectiveRange.range.end.line + 1,
					]),
				)

				actions.push(
					this.createAction(ACTION_TITLES.IMPROVE, vscode.CodeActionKind.QuickFix, COMMAND_IDS.IMPROVE, [
						filePath,
						effectiveRange.text,
						effectiveRange.range.start.line + 1,
						effectiveRange.range.end.line + 1,
					]),
				)
			}

			return actions
		} catch (error) {
			console.error("Error providing code actions:", error)
			return []
		}
	}
}

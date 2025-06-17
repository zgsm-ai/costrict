import * as vscode from "vscode"

export class ReviewComment implements vscode.Comment {
	constructor(
		public id: string,
		public body: string | vscode.MarkdownString,
		public mode: vscode.CommentMode,
		public author: vscode.CommentAuthorInformation,
		public parent?: vscode.CommentThread,
		public contextValue?: string,
	) {}
}

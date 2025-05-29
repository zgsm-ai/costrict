import * as vscode from "vscode"

/**
 * 评论线程信息接口
 */
export interface CommentThreadInfo {
	/** 问题唯一标识 */
	issueId: string
	/** 文件URI */
	fileUri: vscode.Uri
	/** 代码范围 */
	range: vscode.Range
	/** 评论对象（由外部传入） */
	comment: vscode.Comment
}

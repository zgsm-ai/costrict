export interface RawStoreTaskConversationPayload {
	task_id: string
	request_id: string
	sender: "user" | "agent"
	prompt_mode?: string
	mode?: string
	model?: string
	start_time?: string
	end_time?: string
	process_time?: number
	process_ttft?: number
	upstream_tokens?: number
	downstream_tokens?: number
	cost?: number
	request_content?: string
	response_content?: string
	user_input?: string
	diff?: string
	diff_lines?: number
	error_code?: string
	error_reason?: string
}

export interface RawStoreTaskSummaryPayload {
	task_id: string
	user_id?: string
	user_name?: string
	client_id?: string
	client_ide: string
	client_version?: string
	client_os?: string
	client_os_version?: string
	caller?: string
	repo_addr?: string
	repo_branch?: string
	work_dir?: string
	diff?: string
	diff_lines?: number
	start_time?: string
	end_time?: string
	upstream_tokens?: number
	downstream_tokens?: number
	cost?: number
}

export interface RawStoreCommitPayload {
	commit_id: string
	commit_time?: string
	repo_addr?: string
	repo_branch?: string
	git_user_name?: string
	git_user_email?: string
	user_id?: string
	user_name?: string
	client_id?: string
	work_path?: string
	comment?: string
	diff?: string
	diff_lines?: number
}

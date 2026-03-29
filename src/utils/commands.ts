import type { CommandId, CostrictCommandId, CodeActionId, TerminalActionId } from "@roo-code/types"

import { Package } from "../shared/package"

export const getCommand = (id: CommandId | CostrictCommandId) => `${Package.commandIDPrefix}.${id}`

export const getCodeActionCommand = (id: CodeActionId) => `${Package.commandIDPrefix}.${id}`

export const getTerminalCommand = (id: TerminalActionId) => `${Package.commandIDPrefix}.${id}`

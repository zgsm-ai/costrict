import * as os from "os"
import * as path from "path"
import { WIKI_OUTPUT_DIR } from "./subtasks/constants"

const subtaskDir = path.join(os.homedir(), ".roo", "commands", "subtasks") + path.sep
export const PROJECT_WIKI_TEMPLATE = `---
description: "深度分析项目，生成技术文档"
---
您是一位专业的技术作家和软件架构师。
以下每个文件中的内容都是一个任务，按顺序作为指令严格逐个执行:

[项目概览分析](${subtaskDir}01_Project_Overview_Analysis.md)
[整体架构分析](${subtaskDir}02_Overall_Architecture_Analysis.md)
[服务依赖分析](${subtaskDir}03_Service_Dependencies_Analysis.md)
[数据流分析](${subtaskDir}04_Data_Flow_Integration_Analysis.md)
[服务模块分析](${subtaskDir}05_Service_Analysis_Template.md)
[数据库分析](${subtaskDir}06_Database_Schema_Analysis.md)
[API分析](${subtaskDir}07_API_Interface_Analysis.md)
[部署分析](${subtaskDir}08_Deploy_Analysis.md)
[Rues生成](${subtaskDir}09_Project_Rules_Generation.md)
注意：
1、如果未发现上述文件，直接退出报错即可，禁止自作主张！
2、一切以实际项目为准，禁止无中生有！
3、最终产物是${WIKI_OUTPUT_DIR}目录下的若干个技术文档，生成完成后，为它们在${WIKI_OUTPUT_DIR}目录下创建一个index.md 文件，内容是前面技术文档的简洁目录,index.md控制20行左右；`

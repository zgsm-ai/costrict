import type { SkillsManager } from "../../../services/skills/SkillsManager"

type SkillsManagerLike = Pick<SkillsManager, "getSkillsForMode">

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&apos;")
}

/**
 * Generate the skills section for the system prompt.
 * Only includes skills relevant to the current mode.
 * Format matches the modes section style.
 *
 * @param skillsManager - The SkillsManager instance
 * @param currentMode - The current mode slug (e.g., 'code', 'architect')
 */
export async function getSkillsSection(
	skillsManager: SkillsManagerLike | undefined,
	currentMode: string | undefined,
): Promise<string> {
	if (!skillsManager || !currentMode) return ""

	// Get skills filtered by current mode (with override resolution)
	const skills = skillsManager.getSkillsForMode(currentMode)
	if (skills.length === 0) return ""

	const skillsXml = skills
		.map((skill) => {
			const name = escapeXml(skill.name)
			const description = escapeXml(skill.description)
			const locationLine = `\n    <location>${escapeXml(skill.path)}</location>`
			return `  <skill>\n    <name>${name}</name>\n    <description>${description}</description>${locationLine}\n  </skill>`
		})
		.join("\n")

	return `====

AVAILABLE SKILLS

<available_skills>
${skillsXml}
</available_skills>

<skill_check>
Before responding, evaluate the user request against available skill descriptions:
- If a skill is potentially relevant: select the most specific one, load it via the skill tool, and follow its instructions.
- If no skill applies: proceed normally without loading any skill.

Guidelines:
- Skills provide structured expert knowledge and proven workflows that go beyond a mode's role definition — loading a relevant skill is strongly encouraged.
- Do not reload a skill already present in conversation.
- Files linked from skills must be explicitly read when needed.
- Skill list is pre-filtered for current mode: "${currentMode}".
</skill_check>
`
}

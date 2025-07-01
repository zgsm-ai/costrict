import { SeverityLevel } from "@roo/shared/codeReview"

export const severityColor = (alpha: number = 1) => {
	return {
		[SeverityLevel.LOW]: `rgba(0,168,234,${alpha})`,
		[SeverityLevel.MIDDLE]: `rgba(240,159,20,${alpha})`,
		[SeverityLevel.HIGH]: `rgba(252,74,74,${alpha})`,
	}
}

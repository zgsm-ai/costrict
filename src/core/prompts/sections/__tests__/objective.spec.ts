import { getObjectiveSection } from "../objective"

describe("getObjectiveSection", () => {
	it("should include proper numbered structure", () => {
		const objective = getObjectiveSection()

		// Check that key numbered items are present
		expect(objective).toContain("1. Analyze the user's message")
		expect(objective).toContain("2. Work through goals sequentially")
		expect(objective).toContain("3. Before tool use")
		expect(objective).toContain("4. On completion")
	})

	it("should include analysis guidance", () => {
		const objective = getObjectiveSection()

		expect(objective).toContain("environment_details")
		expect(objective).toContain("verify all required params")
	})

	it("should include parameter inference guidance", () => {
		const objective = getObjectiveSection()

		expect(objective).toContain("Missing required params")
		expect(objective).toContain("ask_followup_question")
		expect(objective).toContain("Never fill missing params with placeholders")
	})

	it("should include attempt_completion guidance", () => {
		const objective = getObjectiveSection()

		expect(objective).toContain("attempt_completion")
	})

	it("should include the OBJECTIVE header", () => {
		const objective = getObjectiveSection()

		expect(objective).toContain("OBJECTIVE")
	})
})

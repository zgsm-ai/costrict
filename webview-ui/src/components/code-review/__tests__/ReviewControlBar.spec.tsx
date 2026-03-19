import { fireEvent, render, screen, waitFor } from "@/utils/test-utils"

import ReviewControlBar from "../ReviewControlBar"

vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/components/ui/hooks/useRooPortal", () => ({
	useRooPortal: () => document.body,
}))

describe("ReviewControlBar", () => {
	test("starts the default review mode from the main button", () => {
		const onStartReview = vi.fn()

		render(<ReviewControlBar onStartReview={onStartReview} onRefresh={vi.fn()} hasFiles={true} isLoading={false} />)

		fireEvent.click(screen.getByTestId("start-review-button"))

		expect(onStartReview).toHaveBeenCalledWith("review")
	})

	test("switches the selected review mode from the dropdown and uses it for the main action", async () => {
		const onStartReview = vi.fn()

		render(<ReviewControlBar onStartReview={onStartReview} onRefresh={vi.fn()} hasFiles={true} isLoading={false} />)

		fireEvent.click(screen.getByTestId("review-mode-trigger"))

		expect(screen.getByTestId("review-mode-menu")).toBeInTheDocument()
		expect(screen.getByTestId("review-mode-item-review")).toBeInTheDocument()
		expect(screen.getByTestId("review-mode-item-security-review")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("review-mode-item-security-review"))

		await waitFor(() => {
			expect(screen.queryByTestId("review-mode-menu")).not.toBeInTheDocument()
			expect(screen.getByTestId("start-review-button")).toHaveTextContent("codereview:welcomePage.securityScan")
		})

		fireEvent.click(screen.getByTestId("start-review-button"))

		expect(onStartReview).toHaveBeenCalledWith("security-review")
	})
})

import { render, fireEvent } from "@testing-library/react"

import { ImageGenerationSettings } from "../ImageGenerationSettings"

// Mock the translation context
vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

describe("ImageGenerationSettings", () => {
	const mockSetImageGenerationProvider = vi.fn()
	const mockSetOpenRouterImageApiKey = vi.fn()
	const mockSetImageGenerationSelectedModel = vi.fn()
	const mockOnChange = vi.fn()

	const defaultProps = {
		enabled: false,
		onChange: mockOnChange,
		imageGenerationProvider: undefined,
		openRouterImageApiKey: undefined,
		openRouterImageGenerationSelectedModel: undefined,
		setImageGenerationProvider: mockSetImageGenerationProvider,
		setOpenRouterImageApiKey: mockSetOpenRouterImageApiKey,
		setImageGenerationSelectedModel: mockSetImageGenerationSelectedModel,
	}

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it.each(["minimax", "minimax-cn"] as const)(
		"edits the MiniMax key for %s without changing another key",
		(provider) => {
			const setMinimaxApiKey = vi.fn()
			const { getByPlaceholderText, queryByPlaceholderText } = render(
				<ImageGenerationSettings
					{...defaultProps}
					enabled
					imageGenerationProvider={provider}
					minimaxApiKey="old-key"
					setMinimaxApiKey={setMinimaxApiKey}
				/>,
			)
			fireEvent.input(getByPlaceholderText("MiniMax API key"), { target: { value: "new-key" } })
			expect(setMinimaxApiKey).toHaveBeenCalledWith("new-key")
			expect(mockSetOpenRouterImageApiKey).not.toHaveBeenCalled()
			expect(
				queryByPlaceholderText("settings:experimental.IMAGE_GENERATION.openRouterApiKeyPlaceholder"),
			).not.toBeInTheDocument()
		},
	)

	describe("Initial Mount Behavior", () => {
		it("should not call setter functions on initial mount with empty configuration", () => {
			render(<ImageGenerationSettings {...defaultProps} />)

			// Should NOT call setter functions on initial mount to prevent dirty state
			expect(mockSetImageGenerationProvider).not.toHaveBeenCalled()
			expect(mockSetOpenRouterImageApiKey).not.toHaveBeenCalled()
			expect(mockSetImageGenerationSelectedModel).not.toHaveBeenCalled()
		})

		it("should not call setter functions on initial mount with existing configuration", () => {
			render(
				<ImageGenerationSettings
					{...defaultProps}
					openRouterImageApiKey="existing-key"
					openRouterImageGenerationSelectedModel="google/gemini-2.5-flash-image"
				/>,
			)

			// Should NOT call setter functions on initial mount to prevent dirty state
			expect(mockSetImageGenerationProvider).not.toHaveBeenCalled()
			expect(mockSetOpenRouterImageApiKey).not.toHaveBeenCalled()
			expect(mockSetImageGenerationSelectedModel).not.toHaveBeenCalled()
		})
	})

	describe("User Interaction Behavior", () => {
		it("should call setimageGenerationSettings when user changes API key", async () => {
			// Set provider to "openrouter" so the API key field renders
			const { getByPlaceholderText } = render(
				<ImageGenerationSettings {...defaultProps} enabled={true} imageGenerationProvider="openrouter" />,
			)

			const apiKeyInput = getByPlaceholderText(
				"settings:experimental.IMAGE_GENERATION.openRouterApiKeyPlaceholder",
			)

			// Simulate user typing
			fireEvent.input(apiKeyInput, { target: { value: "new-api-key" } })

			// Should call setimageGenerationSettings
			expect(defaultProps.setOpenRouterImageApiKey).toHaveBeenCalledWith("new-api-key")
		})

		// Note: Testing VSCode dropdown components is complex due to their custom nature
		// The key functionality (not marking as dirty on initial mount) is already tested above
	})

	describe("Conditional Rendering", () => {
		it("should render input fields when enabled is true and provider is openrouter", () => {
			// Set provider to "openrouter" so the API key field renders
			const { getByPlaceholderText } = render(
				<ImageGenerationSettings {...defaultProps} enabled={true} imageGenerationProvider="openrouter" />,
			)

			expect(
				getByPlaceholderText("settings:experimental.IMAGE_GENERATION.openRouterApiKeyPlaceholder"),
			).toBeInTheDocument()
		})

		// it("should not render API key field when provider is roo", () => {
		// 	const { queryByPlaceholderText } = render(
		// 		<ImageGenerationSettings {...defaultProps} enabled={true} imageGenerationProvider="roo" />,
		// 	)

		// 	expect(
		// 		queryByPlaceholderText("settings:experimental.IMAGE_GENERATION.openRouterApiKeyPlaceholder"),
		// 	).not.toBeInTheDocument()
		// })

		it("should not render input fields when enabled is false", () => {
			const { queryByPlaceholderText } = render(<ImageGenerationSettings {...defaultProps} enabled={false} />)

			expect(
				queryByPlaceholderText("settings:experimental.IMAGE_GENERATION.openRouterApiKeyPlaceholder"),
			).not.toBeInTheDocument()
		})
	})
})

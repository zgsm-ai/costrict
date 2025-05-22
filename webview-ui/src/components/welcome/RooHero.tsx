import { useState } from "react"

const RooHero = () => {
	const [imagesBaseUri] = useState(() => {
		const w = window as any
		return w.IMAGES_BASE_URI || ""
	})

	return (
		<div className="flex flex-col items-center justify-center pb-4 forced-color-adjust-none">
			<div
				style={{
					backgroundColor: "var(--vscode-foreground)",
					WebkitMaskImage: `url('${imagesBaseUri}/shenma_robot_logo_big.png')`,
					WebkitMaskRepeat: "no-repeat",
					WebkitMaskSize: "contain",
					maskImage: `url('${imagesBaseUri}/shenma_robot_logo_big.png')`,
					maskRepeat: "no-repeat",
					maskSize: "contain",
				}}
				className="mx-auto">
				<img src={imagesBaseUri + "/shenma_robot_logo_big.png"} alt="Roo logo" className="h-8 opacity-0" />
			</div>
		</div>
	)
}

export default RooHero

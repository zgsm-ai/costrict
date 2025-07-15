import { useState } from "react"

const RooHero = () => {
	const [imagesBaseUri] = useState(() => {
		const w = window as any
		return w.IMAGES_BASE_URI || ""
	})

	return (
		<div className="flex flex-col items-center justify-center pb-4 forced-color-adjust-none">
			<div className="mx-auto">
				<img src={imagesBaseUri + "/shenma.svg"} alt="Costrict logo" />
			</div>
		</div>
	)
}

export default RooHero

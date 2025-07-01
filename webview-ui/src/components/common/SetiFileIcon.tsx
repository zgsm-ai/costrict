import React from "react"
import { themeIcons } from "seti-icons"

const getIcon = themeIcons({
	blue: "#268bd2",
	grey: "#657b83",
	"grey-light": "#839496",
	green: "#859900",
	orange: "#cb4b16",
	pink: "#d33682",
	purple: "#6c71c4",
	red: "#dc322f",
	white: "#fdf6e3",
	yellow: "#b58900",
	ignore: "#586e75",
})
interface SetiFileIconProps {
	fileName: string
	size?: number
	className?: string
	style?: React.CSSProperties
}

const SetiFileIcon: React.FC<SetiFileIconProps> = ({ fileName, size = 16, className = "", style = {} }) => {
	const { svg, color } = getIcon(fileName)

	return (
		<div
			className={`inline-flex items-center justify-center flex-shrink-0 ${className}`}
			style={{
				width: size,
				height: size,
				fill: color,
				...style,
			}}
			dangerouslySetInnerHTML={{ __html: svg }}
		/>
	)
}

export default SetiFileIcon

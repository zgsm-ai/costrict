import i18next from "i18next"

// Initialize i18next with an empty resource set so language bundles can be
// loaded lazily during extension activation or when the user switches language.
i18next.init({
	lng: "en",
	fallbackLng: "en",
	debug: false,
	resources: {},
	interpolation: {
		escapeValue: false,
	},
})

export default i18next

// Mock for os-locale module
const osLocale = {
	osLocale: jest.fn().mockResolvedValue("en-US"),
}

module.exports = osLocale

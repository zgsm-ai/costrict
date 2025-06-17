export interface PackageInfo {
	packageName: string
	os: string
	arch: string
	size: number
	checksum: string
	sign: string
	checksumAlgo: string
	versionId: {
		major: number
		minor: number
		micro: number
		support: string
	}
	build: string
	versionDesc: string
}

export interface PackagesResponse {
	os: string
	arch: string
	latest: VersionInfo
	versions: VersionInfo[]
}

export interface VersionInfo {
	versionId: {
		major: number
		minor: number
		micro: number
		support: string
	}
	appUrl: string
	packageUrl: string
	infoUrl: string
}

const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")

const outputDir = path.join(__dirname, "../src/core/codebase/types")
if (!fs.existsSync(outputDir)) {
	fs.mkdirSync(outputDir, { recursive: true })
}

try {
	execSync(
		`
    npx protoc \
    --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
    --ts_proto_out=${outputDir} \
    --ts_proto_opt=outputClientImpl=@grpc/grpc-js \
    --ts_proto_opt=outputServices=grpc-js \
    -I=./src/core/codebase \
    ./src/core/codebase/codebase_syncer.proto
  `,
		{ stdio: "inherit" },
	)
	console.log("Proto文件生成成功！")
} catch (error) {
	console.error("生成失败:", error.message)
	process.exit(1)
}

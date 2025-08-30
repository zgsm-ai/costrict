<!-- git remote add upstream git@github.com:RooCodeInc/Roo-Code.git
 设置上游仓库 -->

`git remote add upstream git@github.com:RooCodeInc/Roo-Code.git`

or

`git remote set-url upstream https://github.com/RooCodeInc/Roo-Code.git`

<!-- git checkout roo-to-main 设置合并分支 -->

`git checkout -b roo-to-main`

<!-- git fetch upstream -->

`git fetch upstream`

<!-- git merge upstream/main --no-edit -->

`git merge upstream/main --no-ff --no-edit`

<!-- 检测测试用例错误 -->

`pnpm test`

<!-- 检测编译错误  -->

`pnpm build`

<!-- git push origin merge-roo-vx -->

`git push origin roo-to-main`

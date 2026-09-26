# adm-binaries

ADM 桌面端与 admAgent 共用的二进制仓库：`admAgent_<ver>_Windows_x86_64.zip` / `admAgent_<ver>_Darwin_arm64.tar.gz`。

- admAgent 本地编译（`build.ps1` / `build.sh`）会把压缩包直接写入本目录。
- 推送：在本目录执行 `node push.mjs`（或在 ADM 仓库执行 `pnpm agent:push`）。脚本每次都以全新的单个提交强制覆盖远端，历史不堆积旧二进制。
- 请勿手动往本仓库 push 历史提交，避免旧二进制留在历史里。

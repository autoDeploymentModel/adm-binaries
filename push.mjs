// adm-binaries 本地推送脚本：把当前目录下的 admAgent 压缩包以单个提交强制推送到远端。
// 每次推送都重建一个全新根提交（orphan）并 --force 覆盖远端 main，
// 仓库历史永远只有 1 个提交，不会堆积旧版本的二进制。
//
// 用法：
//   node push.mjs                              在 adm-binaries/ 目录内执行（或在 ADM 仓库执行 pnpm agent:push）
//   ADM_BINARIES_REPO=<url> node push.mjs      指定远端仓库（默认读 origin，缺失时用内置默认值）
//   node push.mjs --dry-run                    演练：本地重建照做，但不真正更新远端

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = "https://github.com/autoDeploymentModel/adm-binaries.git";
const ARCHIVE_RE = /^admAgent_(.+)_(Windows_x86_64\.zip|Darwin_arm64\.tar\.gz)$/;
const TEMP_BRANCH = "__adm_push__";

function run(args) {
  return execFileSync("git", args, { cwd: BASE, encoding: "utf8" });
}

function tryRun(args) {
  try {
    return execFileSync("git", args, { cwd: BASE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() || null;
  } catch {
    return null;
  }
}

function main() {
  const dryRun = process.argv.includes("--dry-run");

  const archives = fs.readdirSync(BASE).filter((name) => ARCHIVE_RE.test(name));
  if (!archives.length) {
    console.error("[push] 当前目录没有 admAgent_*.{zip,tar.gz} 压缩包，请先编译 admAgent（build.ps1 / build.sh）");
    process.exit(1);
  }
  const versions = [...new Set(archives.map((name) => name.match(ARCHIVE_RE)[1]))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  const userName = tryRun(["config", "user.name"]);
  const userEmail = tryRun(["config", "user.email"]);
  if (!userName || !userEmail) {
    console.error("[push] 本机未配置 git 提交身份，请先执行：");
    console.error('  git config --global user.name "你的名字" && git config --global user.email "你的邮箱"');
    process.exit(1);
  }

  // 仓库根必须就是脚本所在目录：该目录被嵌套在其它 git 仓库里时，
  // rev-parse 会向上找到外层仓库，绝不能把外层仓库的内容提交/覆盖
  if (!fs.existsSync(path.join(BASE, ".git"))) {
    run(["init", "-q", "-b", "main"]);
  }
  const topLevel = tryRun(["rev-parse", "--show-toplevel"]);
  const normalize = (p) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));
  if (!topLevel || normalize(topLevel) !== normalize(BASE)) {
    console.error(`[push] 脚本所在目录不是独立的 git 仓库（仓库根为 ${topLevel || "未知"}），已中止以免影响其它仓库`);
    process.exit(1);
  }

  tryRun(["config", "core.autocrlf", "false"]); // 二进制仓库，避免行尾转换与告警
  const repoUrl = process.env.ADM_BINARIES_REPO || tryRun(["remote", "get-url", "origin"]) || DEFAULT_REPO;

  for (const name of archives) console.log(`[push] 同步 ${name}`);

  try {
    // 重建全新根提交：历史里只保留本次内容，旧二进制不随提交链堆积
    tryRun(["checkout", "-q", "main"]); // 从上次中断的临时分支切回
    tryRun(["branch", "-D", TEMP_BRANCH]);
    run(["checkout", "-q", "--orphan", TEMP_BRANCH]);
    run(["add", "-A"]);
    run([
      "-c", `user.name=${userName}`,
      "-c", `user.email=${userEmail}`,
      "commit", "-q", "-m", `admAgent ${versions.join(" / ")}`,
    ]);
    run(["branch", "-M", TEMP_BRANCH, "main"]);

    const pushArgs = ["push", "--force"];
    if (dryRun) pushArgs.push("--dry-run");
    pushArgs.push(repoUrl, "main");
    execFileSync("git", pushArgs, { cwd: BASE, stdio: "inherit" });
    console.log(`[push] ${dryRun ? "演练完成（未更新远端）" : "已强制覆盖远端"} ${repoUrl}（${archives.length} 个压缩包）`);
  } catch (e) {
    console.error(`[push] 推送失败：${(e.stderr || e.message).toString().split("\n")[0]}`);
    console.error("[push] 本地提交已重建为最新内容，修复网络/权限后重跑本脚本即可");
    process.exitCode = 1;
  }
}

main();

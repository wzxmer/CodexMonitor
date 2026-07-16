import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const tauriRoot = join(projectRoot, "src-tauri");
const debug = process.argv.includes("--debug");
const profile = debug ? "debug" : "release";
const cargo = process.env.CARGO?.trim() || "cargo";
const rustc = process.env.RUSTC?.trim() || "rustc";

const rustcResult = spawnSync(rustc, ["-vV"], {
  cwd: projectRoot,
  encoding: "utf8",
});
if (rustcResult.status !== 0) {
  process.stderr.write(rustcResult.stderr || "Failed to inspect the Rust target.\n");
  process.exit(rustcResult.status ?? 1);
}

const host = /^host:\s+(.+)$/m.exec(rustcResult.stdout)?.[1]?.trim();
const explicitTarget = process.env.CARGO_BUILD_TARGET?.trim();
const target = explicitTarget || host;
if (!target || !target.includes("windows")) {
  console.error("[stage:installer-migrator] Windows Rust target required.");
  process.exit(1);
}

const cargoArgs = [
  "build",
  "--manifest-path",
  join(tauriRoot, "Cargo.toml"),
  "--bin",
  "codex_monitor_installer_migrator",
];
if (!debug) cargoArgs.push("--release");
if (explicitTarget) cargoArgs.push("--target", target);

const build = spawnSync(cargo, cargoArgs, {
  cwd: projectRoot,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

const configuredTargetDir = process.env.CARGO_TARGET_DIR?.trim();
const targetRoot = configuredTargetDir
  ? isAbsolute(configuredTargetDir)
    ? configuredTargetDir
    : resolve(projectRoot, configuredTargetDir)
  : join(tauriRoot, "target");
const profileRoot = explicitTarget
  ? join(targetRoot, target, profile)
  : join(targetRoot, profile);
const source = join(profileRoot, "codex_monitor_installer_migrator.exe");
if (!existsSync(source)) {
  console.error("[stage:installer-migrator] built helper missing:", source);
  process.exit(1);
}

const destinationDir = join(tauriRoot, "binaries");
const destination = join(
  destinationDir,
  `codex-monitor-installer-migrator-${target}.exe`,
);
mkdirSync(destinationDir, { recursive: true });
copyFileSync(source, destination);
console.log("[stage:installer-migrator] staged", destination);

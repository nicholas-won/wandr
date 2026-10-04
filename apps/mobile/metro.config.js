// Metro in the pnpm monorepo. Expo's default config already detects the workspace (SDK 52+), but we
// set watchFolders explicitly so edits in packages/* (api-contract, core) hot-reload.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), workspaceRoot]));
config.resolver.nodeModulesPaths = Array.from(
  new Set([
    ...(config.resolver.nodeModulesPaths ?? []),
    path.resolve(projectRoot, "node_modules"),
    path.resolve(workspaceRoot, "node_modules"),
  ]),
);

// Agent worktrees live in .claude/worktrees inside the repo: never watch or resolve from them, or
// Metro sees duplicate packages and reloads constantly.
const worktrees = new RegExp(`^${path.join(workspaceRoot, ".claude").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/|$)`);
const prior = config.resolver.blockList;
config.resolver.blockList = [...(Array.isArray(prior) ? prior : prior ? [prior] : []), worktrees];

module.exports = config;

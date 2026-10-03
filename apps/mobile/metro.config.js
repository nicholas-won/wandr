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

module.exports = config;

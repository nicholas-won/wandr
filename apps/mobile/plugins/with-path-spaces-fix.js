/**
 * Config plugin: make iOS builds work when the repo path contains spaces (the founder's checkout
 * is under "Group Travel App"). Two upstream scripts break on spaces:
 *  1. expo-constants' podspec runs
 *       bash -l -c "$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"
 *     without quoting the path. We quote it in a Podfile post_install hook.
 *  2. The app's "Bundle React Native code and images" phase runs the react-native-xcode.sh path
 *     through unquoted backticks. We switch it to a quoted "$(…)".
 * Both fail with "No such file or directory: …/Group". Remove once fixed upstream.
 */
const { withPodfile, withXcodeProject } = require("expo/config-plugins");

const MARKER = "# wandr: quote script paths with spaces";
// get-app-config-ios.sh itself also uses an unquoted `basename $PROJECT_DIR`, so with spaces it
// silently skips writing app.config (then expo-linking can't find the scheme). We replace the
// phase with the same steps, quoted.
const SNIPPET = `
    ${MARKER}
    installer.pods_project.targets.each do |t|
      t.shell_script_build_phases.each do |p|
        next unless p.shell_script.include?('scripts/get-app-config-ios.sh')
        p.shell_script = <<~'SH'
          set -eo pipefail
          PKG_DIR="$PODS_TARGET_SRCROOT/.."
          PROJECT_ROOT="\${PROJECT_ROOT:-$PROJECT_DIR/../..}"
          if [ "$BUNDLE_FORMAT" == "shallow" ]; then
            RESOURCE_DEST="$CONFIGURATION_BUILD_DIR/EXConstants.bundle"
          else
            RESOURCE_DEST="$CONFIGURATION_BUILD_DIR/EXConstants.bundle/Contents/Resources"
          fi
          mkdir -p "$RESOURCE_DEST"
          cd "$PROJECT_ROOT"
          "$PKG_DIR/scripts/with-node.sh" "$PKG_DIR/scripts/getAppConfig.js" "$PROJECT_ROOT" "$RESOURCE_DEST"
        SH
      end
    end
`;

// In project.pbxproj the script is stored escaped: `\"$NODE_BINARY\" --print \"…\"`
const BACKTICK_RE = /`(\\"\$NODE_BINARY\\" --print [^`]*)`/;

function withQuotedBundleScript(config) {
  return withXcodeProject(config, (cfg) => {
    const phases = cfg.modResults.hash.project.objects.PBXShellScriptBuildPhase || {};
    for (const phase of Object.values(phases)) {
      if (!phase || typeof phase !== "object" || typeof phase.shellScript !== "string") continue;
      phase.shellScript = phase.shellScript.replace(BACKTICK_RE, (_, inner) => `\\"$(${inner})\\"`);
    }
    return cfg;
  });
}

module.exports = function withPathSpacesFix(config) {
  config = withQuotedBundleScript(config);
  return withPodfile(config, (cfg) => {
    const contents = cfg.modResults.contents;
    if (!contents.includes(MARKER)) {
      cfg.modResults.contents = contents.replace(/post_install do \|installer\|\n/, (m) => m + SNIPPET);
    }
    return cfg;
  });
};

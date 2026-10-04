/**
 * Config plugin: make iOS builds work when the repo path contains spaces (the founder's checkout
 * is under "Group Travel App"). expo-constants' podspec runs
 *   bash -l -c "$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"
 * without quoting the path, so xcodebuild fails with "No such file or directory: …/Group".
 * We quote it in a Podfile post_install hook. Remove once fixed upstream.
 */
const { withPodfile } = require("expo/config-plugins");

const MARKER = "# wandr: quote script paths with spaces";
const SNIPPET = `
    ${MARKER}
    installer.pods_project.targets.each do |t|
      t.shell_script_build_phases.each do |p|
        s = p.shell_script
        target = '$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh'
        if s.include?(target) && !s.include?("'" + target + "'")
          p.shell_script = s.sub(target, "'" + target + "'")
        end
      end
    end
`;

module.exports = function withPathSpacesFix(config) {
  return withPodfile(config, (cfg) => {
    const contents = cfg.modResults.contents;
    if (!contents.includes(MARKER)) {
      cfg.modResults.contents = contents.replace(/post_install do \|installer\|\n/, (m) => m + SNIPPET);
    }
    return cfg;
  });
};

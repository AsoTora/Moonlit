#!/usr/bin/env bash
# Usage: e2e/run-ios.sh [build|test|all] [maestro flow paths...]
# Builds the Debug app with test configuration, then runs the Maestro listener journeys
# against e2e/fixture-server.ts on an iOS simulator. Artifacts go to e2e/artifacts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMMAND="${1:-all}"
shift || true

SIMULATOR="${E2E_SIMULATOR:-}"
FIXTURE_PORT=4010
ARTIFACTS="$ROOT/e2e/artifacts"
DERIVED_DATA="$ROOT/ios/build"
APP_PATH="$DERIVED_DATA/Build/Products/Debug-iphonesimulator/AIVoice.app"
AUTH_FILE="$ROOT/src/constants/auth.ts"
AUTH_BACKUP="$ROOT/e2e/.auth.ts.backup"
PLIST_FILE="$ROOT/ios/GoogleService-Info.plist"
PLIST_BACKUP="$ROOT/e2e/.GoogleService-Info.plist.backup"

export LANG=en_US.UTF-8
export PATH="$HOME/.maestro/bin:$PATH"
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
if [[ -z "${JAVA_HOME:-}" && -d /opt/homebrew/opt/openjdk@17 ]]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17
  export PATH="$JAVA_HOME/bin:$PATH"
fi
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  export NVM_DIR="$HOME/.nvm"
  set +u
  . "$NVM_DIR/nvm.sh" >/dev/null
  nvm use 24 >/dev/null
  set -u
fi

PIDS=()
RECORDER_PID=""

restore() {
  if [[ -n "$RECORDER_PID" ]]; then
    kill -INT "$RECORDER_PID" 2>/dev/null || true
    wait "$RECORDER_PID" 2>/dev/null || true
  fi
  for pid in "${PIDS[@]:-}"; do
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
  done
  if [[ -f "$AUTH_BACKUP" ]]; then
    mv "$AUTH_BACKUP" "$AUTH_FILE"
  elif [[ -f "$AUTH_FILE" ]] && cmp -s "$AUTH_FILE" "$ROOT/e2e/auth.ts"; then
    rm "$AUTH_FILE"
  fi
  if [[ -f "$PLIST_BACKUP" ]]; then
    mv "$PLIST_BACKUP" "$PLIST_FILE"
  fi
}
trap restore EXIT

use_test_auth() {
  if [[ -f "$AUTH_FILE" ]] && ! cmp -s "$AUTH_FILE" "$ROOT/e2e/auth.ts"; then
    mv "$AUTH_FILE" "$AUTH_BACKUP"
  fi
  cp "$ROOT/e2e/auth.ts" "$AUTH_FILE"
}

# Picks E2E_SIMULATOR, or the first iPhone, from the newest iOS simulator runtime.
simulator_udid() {
  xcrun simctl list devices available -j | node -e '
    const runtimes = Object.entries(JSON.parse(require("fs").readFileSync(0)).devices)
      .filter(([key]) => key.includes(".iOS-"))
      .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }));
    const name = process.argv[1];
    const device = runtimes
      .flatMap(([, devices]) => devices)
      .find((d) => (name ? d.name === name : d.name.startsWith("iPhone")));
    if (!device) process.exit(1);
    console.log(device.udid);
  ' "$SIMULATOR"
}

build() {
  cd "$ROOT"
  yarn install --immutable
  (cd ios && pod install)
  cp "$PLIST_FILE" "$PLIST_BACKUP"
  cp "$ROOT/e2e/GoogleService-Info.plist" "$PLIST_FILE"
  if ! ENVFILE=.env.e2e xcodebuild \
    -workspace ios/AIVoice.xcworkspace \
    -scheme AIVoice \
    -configuration Debug \
    -sdk iphonesimulator \
    -destination "platform=iOS Simulator,id=$(simulator_udid)" \
    -derivedDataPath "$DERIVED_DATA" \
    build >"$ARTIFACTS/xcodebuild.log" 2>&1; then
    grep -E 'error:|\*\* BUILD' "$ARTIFACTS/xcodebuild.log" | head -40
    exit 1
  fi
  mv "$PLIST_BACKUP" "$PLIST_FILE"
  grep -q "localhost:$FIXTURE_PORT" node_modules/react-native-config/ios/ReactNativeConfig/GeneratedDotEnv.m ||
    { echo "The build did not use .env.e2e"; exit 1; }
  cp ios/AIVoice.xcworkspace/xcshareddata/swiftpm/Package.resolved "$ARTIFACTS/"
  echo "Built $APP_PATH"
}

wait_for() {
  local url="$1"
  for _ in $(seq 1 60); do
    curl -fs "$url" >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "Timed out waiting for $url"
  exit 1
}

run_tests() {
  cd "$ROOT"
  local udid
  udid="$(simulator_udid)"
  xcrun simctl boot "$udid" 2>/dev/null || true
  xcrun simctl bootstatus "$udid" -b >/dev/null
  xcrun simctl install "$udid" "$APP_PATH"

  node e2e/fixture-server.ts >"$ARTIFACTS/fixture-server.log" 2>&1 &
  PIDS+=($!)
  wait_for "http://localhost:$FIXTURE_PORT/stories"

  if ! curl -fs http://localhost:8081/status >/dev/null 2>&1; then
    yarn start --reset-cache >"$ARTIFACTS/metro.log" 2>&1 &
    PIDS+=($!)
    wait_for http://localhost:8081/status
  fi
  curl -fs "http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false" -o /dev/null

  xcrun simctl spawn "$udid" log stream --level debug --predicate 'process == "AIVoice"' \
    >"$ARTIFACTS/app.log" 2>&1 &
  PIDS+=($!)
  xcrun simctl io "$udid" recordVideo --codec h264 --force "$ARTIFACTS/simulator.mp4" \
    >"$ARTIFACTS/recorder.log" 2>&1 &
  RECORDER_PID=$!

  local flows=("$@")
  [[ ${#flows[@]} -gt 0 ]] || flows=(.maestro)
  maestro --device "$udid" test \
    --format junit --output "$ARTIFACTS/report.xml" \
    --test-output-dir "$ARTIFACTS/maestro" \
    -e FIXTURE_URL="http://localhost:$FIXTURE_PORT" \
    "${flows[@]}"
}

mkdir -p "$ARTIFACTS"
use_test_auth
case "$COMMAND" in
  build) build ;;
  test) run_tests "$@" ;;
  all) build && run_tests "$@" ;;
  *) echo "Usage: e2e/run-ios.sh [build|test|all] [flows...]"; exit 2 ;;
esac

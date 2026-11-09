# Listener journeys (iOS)

Maestro flows in `.maestro/` drive the Debug app on an iOS simulator. The app calls a local fixture API (`e2e/fixture-server.ts`), not production.

## Run

```sh
e2e/run-ios.sh all                     # build, then run every flow
e2e/run-ios.sh test                    # run every flow with the last build
e2e/run-ios.sh test .maestro/02-play-pause-resume.yaml
```

Requirements: Xcode 26 or later, CocoaPods, Node.js 24, Java 17 or later, and Maestro. The current native dependencies (Firebase iOS SDK 13 and Adapty 4) need Swift tools 6.2, so Xcode 16 cannot build the app. Set `E2E_SIMULATOR` to choose a simulator by name. Otherwise the script uses the first iPhone of the newest iOS runtime.

The script writes reports, screenshots, logs, and a simulator recording to `e2e/artifacts/`. Git ignores this folder.

CI runs the same command on the `macos-26` runner (`.github/workflows/ios-e2e.yml`).

## Test configuration

- `e2e/auth.ts` replaces `src/constants/auth.ts` during the run. It contains placeholder keys only. Adapty rejects its key, so the paywall is not available.
- `e2e/GoogleService-Info.plist` replaces the Firebase file during the build only, so a run does not send data to the production Firebase project.
- `.env.e2e` sets `SERVER_URL` to the fixture API and sets `E2E=true`, which hides LogBox toasts.

## Fixture API

`POST /__control` with `{"mode": "...", "hideStoryIds": [...]}` changes the behavior. `DELETE /__control` resets it. `GET /__requests` returns the requests that the app made.

| Mode            | Behavior                                              |
| --------------- | ----------------------------------------------------- |
| `normal`        | Stories, recordings, covers, and audio are available. |
| `api-down`      | The API returns HTTP 500. Media is available.         |
| `audio-missing` | Audio files return HTTP 404.                          |
| `offline`       | The API returns HTTP 500 and media returns HTTP 503.  |

## Known issues

Flows with the `known-issue` tag assert the correct behavior of an open app defect. The main suite excludes them. `run-ios.sh` runs them in a second pass, and their result does not change the exit status. Remove the tag when the defect is fixed.

## Scope

- Android flows are not available yet.
- Recording a voice is out of scope, because it needs a microphone and paid voice synthesis.
- The paywall screen needs an Adapty sandbox key. The flows check only that locked content stays locked.

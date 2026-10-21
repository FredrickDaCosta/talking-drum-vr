# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - M0 ("Hello XR")

- Scaffold IWSDK v1.0.1 VR TypeScript application with WebXR hand tracking enabled.
- Add procedural placeholder Yoruba talking drum (`0.5 m` ahead, `0.35 m` below eye level).
- Add central `src/app/config.ts` and URL flag parser `src/app/flags.ts` (`?xrfps=1`, `?debug=1`).
- Implement `FpsOverlay` (`?xrfps=1`) and `DebugHud` stub (`?debug=1`).
- Configure sub-path safe asset resolution via `import.meta.env.BASE_URL` and `BASE_PATH`.

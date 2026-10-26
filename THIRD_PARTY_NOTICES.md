# Third-party notices

ROOM FACTORY AR is an independent project. It is not endorsed, sponsored or
supported by Niantic Spatial, Inc. or any other third party.

## 8th Wall XR Engine Binary

- Package: `@8thwall/engine-binary` version `1.0.0`
- Copyright © 2026 Niantic Spatial, Inc. All rights reserved.
- License: **XR Engine License Agreement**, not MIT, not open source.
- Full license text included with the package: `node_modules/@8thwall/engine-binary/LICENSE`,
  copied into the production build as `dist/external/xr/LICENSE`, and archived in
  this repository at `LICENSES/8thwall-engine-LICENSE.txt`.
- Upstream license: <https://github.com/8thwall/engine/blob/main/LICENSE>
- Permitted-use FAQ: <https://8thwall.org/docs/migration/faq#distributed-engine-binary-license-and-permitted-use>
- Attribution guidance: <https://8thwall.org/docs/open-source>

The project distributes the engine **unmodified** as a black-box runtime. It does
not reverse-engineer, decompile, modify or recompile the engine. The project is a
free game/product that uses the engine's functionality; it does not sell, sublicense
or redistribute the engine as a competing SDK. The license restricts paid products
whose value derives entirely or substantially from the engine; verify the current
license before any commercial release.

Required attribution: **XR Engine created by Niantic Spatial, Inc.** A link to the
license is provided in the About dialog and in this file. The project does not imply
official support, partnership or endorsement.

## Three.js

- Package: `three` `0.186.1`
- License: MIT
- Copyright © 2010-2026 three.js authors
- Upstream: <https://github.com/mrdoob/three.js>
- License text archived at `LICENSES/three-LICENSE.txt`.

## @8thwall/image-target-cli

- Package: `@8thwall/image-target-cli` `1.0.0`
- License: MIT
- Used as a dev tool to generate `public/marker/room-factory-marker.json` and its
  companion images. Generated marker artwork is original to this project.

## sharp

- Package: `sharp` `0.34.5`
- License: Apache-2.0
- Dev dependency used only by `scripts/generate-marker.mjs` to rasterize the original
  SVG marker. Not part of the runtime bundle.

## Build/test tooling

- TypeScript — Apache-2.0
- Vite — MIT
- Vitest — MIT
- Playwright / @playwright/test — Apache-2.0
- `@types/three`, `@types/node` — MIT / DefinitelyTyped licenses

These are development dependencies; their licenses are available in the respective
packages under `node_modules`.

## Assets

All building models, platform geometry, grid, marker artwork and UI graphics were
created procedurally for this project. No assets, models, logos or code were copied
from `bulgakov_game` or other third-party games. The project does not include a
third-party font; system fonts are used.

## Privacy

The application does not implement recording, uploading or server-side processing of
camera frames. AR video is processed locally by the engine on the device. The 8th Wall
binary is a third-party component; this statement describes the application's own
behavior, not every internal implementation detail of the SDK. No analytics pixels,
advertising SDKs or accounts are included.

# deepmerge (local 4.3.2)

This is [deepmerge](https://github.com/TehShrike/deepmerge) 4.3.1, the last published release, with one change. It exists because every published version from 4.2.0 is inside [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) (CVE-2026-93753) and no patched release exists yet.

`mergeObject` now skips the `__proto__` key in both copy loops. Assigning `__proto__` on the new plain-object destination replaced its prototype instead of adding a key, so a null-prototype target, a `null` placeholder, or an own `__proto__` key from `JSON.parse` could give the merged result an attacker-chosen prototype. This is the same change as the upstream fix proposals ([#286](https://github.com/TehShrike/deepmerge/pull/286), [#287](https://github.com/TehShrike/deepmerge/pull/287), [#290](https://github.com/TehShrike/deepmerge/pull/290)).

It is development-only here: Jest (`jest-config`) and `fork-ts-checker-webpack-plugin` use it to merge this repo's own configuration. The root `package.json` points every copy at this folder through an override.

Drop this folder and the override once upstream publishes a fixed release. `src/vendor.deepmerge.test.ts` checks the fix.

`dist/cjs.js`, `index.d.ts` and `license.txt` are the upstream 4.3.1 files; only `dist/cjs.js` is changed.

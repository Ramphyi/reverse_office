# Strict license status — 2026-10-14

**Full company application and previous company images: NOT COMPLIANT. Whole-suite migration: NOT COMPLETE.**

**New separate artifact: Reverse Studio.** Original MIT Writer/Sheets/Slides editors are now implemented with a freestanding original server in a `scratch` container. The final image excludes npm, Node, ONLYOFFICE and OS packages. Its isolated scope, inventory and limitations are documented in [STUDIO.md](STUDIO.md). Run `node scripts/studio-audit.mjs` for its source allowlist check. This does not lift the full company application's release block or approve its existing runtime/dependency graph.

The owner explicitly requires MIT or Apache-2.0 for every distributed component, including container OS packages and runtime dependencies. This is an exact allowlist, not a general “permissive licensing” requirement. BSD, ISC, MIT-0, OFL, public-domain, GPL/LGPL/AGPL and other licenses are not silently treated as allowed. Where a package offers an actual MIT **OR** GPL choice, selecting MIT can satisfy the declaration check; MIT **AND** Zlib cannot.

The repository's original Reverse Office code is now explicitly MIT-licensed in the root LICENSE. That grant does not replace the licenses of third-party packages, assets, runtimes or services and does not make the combined product MIT-only.

## Confirmed blockers

| Component                          | Evidence                                                                                                              | Consequence                                                                                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ONLYOFFICE Document Server 10.0.0  | AGPL notices and [upstream repository](https://github.com/ONLYOFFICE/DocumentServer)                                  | Replace the whole editor service; another wrapper or fork does not change its license.                                                                                                    |
| Node.js 22.18.0 runtime            | Installed `/usr/local/LICENSE` and [versioned upstream notices](https://github.com/nodejs/node/blob/v22.18.0/LICENSE) | Node's own MIT license does not cover every embedded dependency. BSD/ISC and other notices remain.                                                                                        |
| GNU libc in the Debian-based image | Installed `/usr/share/doc/libc6/copyright` identifies LGPL-2.1-or-later, with additional component notices            | The current image cannot qualify. Merely using `scratch` while copying the existing Node binary would not fix bundled runtime licenses.                                                   |
| Debian shell and other OS packages | Installed `/usr/share/doc/dash/copyright` includes BSD-3-Clause and file-specific notices                             | Need an artifact without these packages, followed by a complete binary/asset inventory.                                                                                                   |
| Bundled fonts                      | `@fontsource-variable/dm-sans` and `@fontsource-variable/manrope`: OFL-1.1                                            | Replace or stop distributing these assets.                                                                                                                                                |
| Icons                              | `lucide-react`: ISC                                                                                                   | Replace with independently created icons or a verified allowed set.                                                                                                                       |
| Transitive npm dependencies        | `package-lock.json`; repeatable audit below                                                                           | Multiple ISC, BSD, MIT-0, Zlib, BlueOak, Unlicense and unknown declarations require replacement or evidence review. A direct dependency's MIT label does not approve its dependency tree. |

Unspecified package declarations are **unresolved**, not automatically a finding that their code has a forbidden license. For example, the installed `busboy`, `streamsearch` and `xmlhttprequest-ssl` LICENSE files contain MIT-style grants despite absent lockfile license fields. These remain fail-closed until exact-version/file evidence is recorded. No third-party license text or package metadata has been edited to manufacture compliance.

## Repeatable checks

Run `npm run license:report` to generate `artifacts/license-audit.json`, containing every locked package's version, path, declared license and production/development classification, plus the confirmed runtime/container blockers. Run `npm run license:check` for a failing release gate. The Dockerfile, startup helper and a separate CI job invoke that gate. **Failure is intentional while the current non-compliant components remain.** Application regression tests are separate; passing functional tests is not a license approval.

Recorded lockfile result: 600 dependency entries, 555 allowed declarations, 45 excluded or unresolved declarations (33 not marked development-only). These are package entries, not a complete final-artifact component count. The five external blocker/review entries summarize additional problems outside npm.

This is a declaration audit and a blocker inventory, not a complete SBOM, source-provenance audit, certification or legal opinion. Optional services, embedded datasets/fonts, static libraries, certificate bundles, generated assets and all remaining OS/runtime notices must be covered in a final-artifact review. Build tooling is included in the npm report and not hidden simply because it is marked development-only.

## Replacement feasibility and required work

The current application cannot meet the exact policy through a drop-in ONLYOFFICE replacement alone. Its Node/SQLite/Debian architecture and part of the frontend dependency tree also need replacement or independently verified alternatives. A distribution-free, statically linked server is a potential architecture, **not an approved artifact**: its runtime, allocator, C library, TLS stack, database, crypto code and every transitive dependency would still need exact-version review. No runtime or base image is approved just because its main repository advertises MIT/Apache-2.0.

[Univer's open-source core](https://github.com/dream-num/univer#-open-source-and-pro) is Apache-2.0, but the vendor explicitly separates commercial features including collaboration, file import/export and several advanced editor capabilities. It is not verified as a feature-equivalent, all-components-compliant replacement. Its transitive dependencies and assets also require inspection. Similarly, MIT-labeled document-generation libraries are not complete interactive Office editors and can have incompatible transitive dependencies.

The remaining implementation work is to select and verify the entire replacement runtime/dependency graph, implement the required editor and backend features without excluded packages, migrate existing native files with explicit compatibility handling, test the new artifacts and audit their contents before lifting the release block. Native Office originals, version history, accounts and local data must be retained; no destructive conversion to the simplified editor is authorized by this policy.

## Operational status

This change introduces the strict policy, evidence report and release block. It **does not** claim to complete the replacement, relabel the previous images or make the currently running installation compliant. The existing local app and ONLYOFFICE container have not been stopped, removed, rebuilt or redeployed by this audit. Prior functionality remains in place pending a compliant migration; prior instructions recommending deployment are superseded by the release block above.

# Authenticated ECC decoder priority: SDK48 evidence

## Scope

`LiveStream.annexbOf` previously tried session RSA/plaintext decoding before its configured `VideoFrameDecoder`. A truthy legacy result could mask successful authenticated ECC decoding. The fix tries the configured ECIES/GCM decoder first, then keeps the existing session/plaintext fallbacks after ECC authentication fails. Streams without `eccPrivateKey` retain the same decode path.

This is a generic decoder-dispatch correction. It adds no device-specific branch, native START profile, API option, transport change, quality setting, or buffering change. The physical example below used a T8214 doorbell with a HomeBase. The temporary native START instrumentation was separate from this source change.

## Physical evidence, 2026-10-23

Both observations used fresh private stream sessions and a generated, matched P-256 pair. The target's first START carried the native 128-character public point; its RSA modulus was removed before encryption. Private scalars, account identifiers, public-point values, and media bytes are excluded from this record.

| Observation                                | Before dispatch change          | After dispatch change             |
| ------------------------------------------ | ------------------------------- | --------------------------------- |
| Artifact                                   | `capture-fresh-native-ECC.json` | `capture-fresh-ECC-dispatch.json` |
| Authenticated ECIES media key              | 32 bytes                        | 32 bytes                          |
| First keyframe outer / inner length        | 256363 / 256184                 | 254980 / 254801                   |
| Difference, matching existing GCM overhead | 179 bytes                       | 179 bytes                         |
| Session decoder / RSA unwrap results       | One truthy result each          | Zero RSA unwrap attempts          |
| Configured ECC decoder calls               | 0                               | 1126                              |
| Authenticated GCM keyframes                | 0                               | 42                                |
| Plaintext fallback frames                  | 0                               | 1084                              |
| Emitted Annex-B video frames               | 0                               | 1126                              |

Before the change, the generated private key authenticated the ECIES envelope, but session-first dispatch prevented any call to the configured ECC decoder. The first keyframe recorded compressed point prefix 3, sign code 1, and frame type 10. Envelope authentication alone did not establish body authentication.

After the change, the first full-GCM authentication occurred at +3.870408 seconds and the first valid Annex-B emission at +3.871854 seconds. The stream emitted 1600 × 2200 H.264. Its last valid frame arrived at +87.208025 seconds, covering about 83.336 seconds of delivered media and about 13.51 frames per second. The 42 authenticated GCM keyframes and 1084 plaintext fallback frames demonstrate why authenticated-first dispatch must retain the fallback path.

The source reset after upstream silence, at about +92.290 seconds. Observed completed packet and emission gaps reached about 5.338 and 5.547 seconds. This experiment validates the decoder correction; it does not fix or establish the cause of the original default-profile disconnections, or demonstrate uninterrupted delivery.

An offline probe on production Node 26.11.1 / OpenSSL 3.5.9 supplied an invalid, all-zero 128-byte RSA ciphertext to a freshly generated RSA-1024 key. `privateDecrypt` returned a 101-byte buffer instead of throwing. This explains how an unauthenticated truthy legacy candidate can hide the authenticated decoder; such a result does not establish successful RSA media decryption.

The runtime owner removed the temporary wrappers, restored the retired stream's decoder, restored seven hooks, and closed the inspector. This SDK patch was not deployed to the live host.

## Artifact provenance

The sanitized observation files remain local under `/tmp/eufy-doorbell-runtime-20261023/`; they are not committed to this repository.

| Artifact                          | SHA-256                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| `capture-fresh-native-ECC.json`   | `89d730782cb92e971468b7f06a6658373fa08ed7c9c7b74598e38ee2c453a2ba` |
| `capture-fresh-ECC-dispatch.json` | `0ac3d1bd025cfab834b8b52dd54496fca0632e05fb8b15db87d189b4a1c039df` |

## Regression and validation

The isolated worktree starts at SDK48 commit `48e4f2f`. `live-ecc-dispatch.spec.ts` creates real P-256 ECIES envelopes and authenticated AES-256-GCM bodies using synthetic media. A session decoder returning truthy garbage reproduces the masking defect. Both authenticated frame emission and encrypted continuation assembly failed before the source edit and passed afterward.

Five regression cases cover authenticated frame priority, split access-unit assembly, legacy fallback after an unrelated ECC key fails authentication, and plaintext fallback with and without an ECC key. The source change only reorders dispatch; it does not change the cryptographic decoders or assembler.

Validation passed: 58 focused tests, TypeScript checking, and complete `npm run verify` with GNU coreutils first in `PATH`. The full run passed 254 test files and 4446 tests, formatting, all guards, build, ESM import, 99 documented snippets, and example typechecking.

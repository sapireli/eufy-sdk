# Channel-zero attached START request slots

The controlled candidate/original/candidate test supports correcting the attached channel-zero START request slot for the tested private-session profile. Both candidate arms completed 180 seconds; the original failed the five-second raw-silence guard. A separate integration run still reached a five-second incoming-media gap. This is not a claim of gap-free delivery or compatibility with every firmware.

## Source behavior and provenance

`P2PSession.sendMediaPayloadLevel2` uses one field for the camera channel and a separate frame-header `type` byte for a request slot. The original implementation forces type zero whenever the camera channel is zero. Other camera channels use `0x0a + (level2Seq & 0x7f)` after authenticated level-2 encryption advances that sequence.

The exception and its comment originated in initial SDK import `c34290813326fa0dd744528be6de49ea1107b8fa`, authored by lenoxys on 2026-08-06. Its parent, `ed81dff3512ae974e4746ccef29e103b6451cbbd`, contained no P2P session source file. Independent per-camera connections were introduced later by Martijn Poppen in `eab46f4` on 2026-09-13. Both pre-beta fork `df535e27` and SDK48 `48e4f2f` retain the exception. It is not introduced by the later contributor PRs reviewed during this investigation.

Allocation depends on acquisition order: the first held HomeBase camera uses its BASE connection, irrespective of channel. Another camera gets a private connection when that BASE connection is claimed. Thus channel zero can occupy either role. Explicit channel zero survives routing, frame filtering, START and STOP; no falsey-zero routing bug was found. Existing allocation tests cover BASE0 then private2; they do not exercise BASE2 then private0.

## Native evidence and limits

The authenticated archived HomeBase capture contains a channel-zero START with type 14 and a channel-two START with type 10. Both use valid P-256 public points encoded as 128 hexadecimal characters. Camera channel therefore does not universally determine the request-slot byte. The archived capture SHA-256 is `5290131e60869fa2950045854afd520cf6ac328a1941995648ee91448305c344`.

Those observed native requests use the simple P-256 request profile. The candidate retains the SDK's complex RSA request profile. Native evidence alone does not prove that profile requires a nonzero channel-zero START slot. Recorded native STOP commands use type zero, so this candidate deliberately retains channel-zero STOP framing.

## Completed direct controls

Each direct arm drains SDK media without downstream processing workloads. Current-SDK arms use `objectMode:true, arrivalTime:true`; pre-beta supports object mode but yields the original video frame directly, without the arrival-time envelope. The observers bind raw UDP, assembled channel-zero frames, LiveStream video, and Readable object identity to the actual target source/session. The three HomeBase sources must first deliver valid frames before the exposure clock begins. An independent standalone source is attempted but is not a readiness requirement.

| SDK and acquisition order                     | Target role | Exposure after three HomeBase first frames | Result                                                                                                                    |
| --------------------------------------------- | ----------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Current48, channel 0 first                    | BASE0       | 180.039 seconds                            | 2856 valid matching frames; maximum raw gap 4.442 seconds; no target error                                                |
| Current48, channel2 first then channel 0      | private0    | 30.246 seconds                             | Five-second raw silence guard; 360 valid matching frames; target remained LIVE with one consumer while siblings continued |
| Pre-beta df535, channel2 first then channel 0 | private0    | About 29.639 seconds                       | Five-second raw silence guard; 240 valid matching frames; target remained LIVE with one consumer while siblings continued |

The pre-beta private0 failure establishes that the transition to beta 0.5 is not required for this observed failure. The role-dependent controls support a targeted framing experiment. They do not independently establish that the request-slot byte is its cause. Exposure windows remain bounded, and these controls do not prove every BASE0 session remains healthy indefinitely.

Local sanitized summary artifacts, independently hashed:

| Artifact under `/tmp/eufy-doorbell-runtime-20261023/` | SHA-256                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `direct-private0/summary.json`                        | `396c7ab7f63df908265573c7218f24529d6f152076fa9ee13b0675a2b066dc36` |
| `direct-base-old-private/summary.json`                | `f4b185a28dadd45327b6c9c366450f09843b8463f8b2f61ef641f5d4d03425c3` |

Full direct-arm artifacts were also independently hashed:

| Artifact under `/tmp/eufy-doorbell-runtime-20261023/`          | SHA-256                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| `direct-private0/current48-private0-direct.json`               | `79b3c5a9d91db913cbc2e8200c8c5b7696223e6bf9c695966c7713cd94cb6174` |
| `direct-base-old-private/current48-base0-reversal-direct.json` | `469bdb113c85c668d312bdd50b9baa4db26c1e18fb8125fcf904ce4fdee4ceda` |
| `direct-base-old-private/prebeta-df535-private0-direct.json`   | `4b02bbb22ecf5208cef3da7685324b118eb8d6242cc1a670ae13b23d22e5cc4f` |

The raw-gap guard and maximum completed-gap metrics differ: the guard also measures the still-open silence at termination. No account identifiers, private keys, public-key values, endpoints, or camera media are included here.

## Candidate scope

The isolated worktree starts at `48e4f2f`. Only an attached channel-zero START joins the existing generated request-slot sequence. Camera channel zero remains in the frame header and authenticated body. The station sentinel 255, channel-zero STOP, nonzero channels, RSA key generation, authenticated plaintext fields, stream type, quality, and decoder paths retain their behavior. There is no topology-policy change or new API.

The private serializer selects zero for `channel === STATION_CHANNEL || (!isStart && channel === 0)`; other attached media requests use `0x0a + (this.level2Seq & 0x7f)`.

The common helper frames both START 1003 and STOP 1004. Removing the channel-zero exception unconditionally would also alter STOP framing, outside the measured candidate scope.

## Offline verification

Four regression cases use real SDK serialization plus authenticated level-2 encryption/decryption with synthetic credentials. The original fails two cases: channel-zero START remains type zero, and repeated channel-zero STARTs do not receive distinct slots. Candidate assertions preserve command 1350, camera 0, sign 8, magic 8/0, stream type 2, account fields and RSA public-modulus length 256. Channel-zero STOP remains type zero with an empty payload. Nonzero START sequencing and station 255/type 0 remain pinned.

After the candidate change, 26 focused tests pass. Complete `npm run verify` passes 254 test files and 4445 tests, formatting, types, all guards, build, 301-export ESM import, 99 documented snippets, and example typechecking. GNU coreutils precedes system tools in `PATH`. Diff checks pass.

Portable candidate bundle: `dist/index.js`, 1304516 bytes; SHA-256 `beba1361f8d0cafd8422816d5a862b788c84e62f55c049b80305dc7c56f156ac`. Native dependency directories are excluded from the portable artifact.

## Controlled candidate/original/candidate result

All three arms used the current SDK48 public API, the same cached session seed and cooldown procedure, the same native camera settings, and no downstream processing workloads. Channel 2 was opened first and held BASE; channel 0 then used its actual private0 session. Target identities were stable within each arm and each source remained LIVE with one consumer. Raw media, assembled video, emitted LiveStream frames, and Readable frame-object identity were bound to that exact target session.

| Arm           | Observed START slots | Exposure after all three HomeBase first frames | Matching valid frames | Maximum raw gap | Outcome           |
| ------------- | -------------------- | ---------------------------------------------- | --------------------- | --------------- | ----------------- |
| B1, candidate | 11                   | 180.063 seconds                                | 2692                  | 4.882 seconds   | Completed         |
| A, original48 | 0                    | 64.575 seconds                                 | 751                   | 5.021 seconds   | Raw-silence guard |
| B2, candidate | 11,12,13,14          | 180.039 seconds                                | 2681                  | 3.446 seconds   | Completed         |

The original arm also stopped assembled and delivered target frames: maximum valid gap 5.040 seconds. Channel-two and channel-one sibling receipts remained fresh, about 2 and 1 milliseconds old at the failure snapshot. The target source still reported LIVE with one consumer. Event-loop maximum near the original failure was 39.322 milliseconds, versus 194.249 milliseconds across that complete arm. Full-arm event-loop maxima were 168.165 milliseconds in B1 and 228.065 milliseconds in B2.

B1 was close to the guard boundary: maximum Readable gap 4.980 seconds. It therefore does not demonstrate gap-free or smooth delivery. B2 naturally reissued START before first media, generating slots 11 through 14; that startup retry history is a recorded covariate. One B2 error concerned the optional standalone source, not the required HomeBase target. The target produced all 2681 matching frames. Both attached doorbell sources remained native 1600×2200 H.264. The channel-one camera changed from 2304 to 1920 pixels wide in all three arms without a quality-setting write.

START metadata came from identical read-only wrappers around actual serializer sends, not an independent NIC capture. They recorded outer command 1350, inner-command context 1003, camera channel 0, sign 8, magic 8/0, and the slot. The wrappers did not modify wire bytes or export plaintext, key or account values. The single candidate code change supplied the serialized nonzero slots; the original serialized zero.

These bounded reversal results support the START-slot correction for this tested SDK RSA/private0 profile. The older pre-beta private0 failure means the beta 0.5 transition is not necessary; this is not attribution to later contributor PRs. The experiment does not prove the HomeBase's internal slot semantics, eliminate all multi-second gaps, or establish behavior on other firmware, cameras, or station channels.

| Artifact under `/tmp/eufy-doorbell-runtime-20261023/direct-start-slot-bab/` | SHA-256                                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `summary.json`                                                              | `717b2d89acb52c880487ddb5b6f2e3eb375e61265dc806aa1667fb03e36c9927` |
| `slot-candidate-B1.json`                                                    | `0ff3c1f37e899db44879aaa3840f914dafd5e6c92bce98d6afbc8a2106f23369` |
| `original48-A.json`                                                         | `ba9602fac2d195c3b6220f06cfc7ceaab2bc70bc9a9c1afb9c55c50a2b17100f` |
| `slot-candidate-B2.json`                                                    | `441154a04864d05fe6ece88db6c10b51891525c63fd296fc7189e8c3059f2aea` |

All four hashes were independently verified locally. The original installed SDK and configuration were restored after the direct trials. Subsequent integration validation is recorded below; its negative result limits the claim to the measured framing correction and bounded private-session benefit.

## Subsequent integration limit

A separate integration run used the signed tracked package `5df6bdf5fb26566d6cbfa7cefa4632a226fce910`, bundle SHA-256 `3850d7cd4c42e8318d414f4e94851cf34518f7f54d1aa780b4de777fabc2395e`. Startup NIC capture confirmed actual channel-zero START slots 11 through 16 with sign 8 and magic 8/0. The target nevertheless reached a five-second incoming-media gap after about 80 seconds of the overall exposure. It had delivered 868 matching assembled, valid and Readable frames and still reported LIVE with one consumer. Event-loop maximum near the gap was 40.567 milliseconds.

The concurrent-consumer pipeline had processed media successfully before the input gap, without a decoder-error or queue-backlog explanation. A sibling source had delayed startup, so this run does not reproduce the direct arms' startup history exactly. It failed the planned longer acceptance window. The original SDK and configuration were restored automatically.

This negative result is material: nonzero START framing does not eliminate all incoming-media silences. It does not erase the bounded direct reversal, and the direct reversal cannot be promoted into an uninterrupted-delivery claim.

| Local artifact under `/tmp/eufy-doorbell-runtime-20261023/production-sdk-canary/` | SHA-256                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `summary.json`                                                                    | `f3b573889b115ac4bbac7570ef5f521ac1f05314c7ab8fffb1141fbce0981182` |
| `canary.json`                                                                     | `7081abbcdf7dc8ab23ddb931080cff0ad164a26c9b5a46cdb0ac1aa8ce092818` |
| `restoration-verification.json`                                                   | `e9ed52f88059fdfcd63ac36b576e34b8bf1822d07a731972fc0c87ebe1d25d26` |

All three artifact hashes were independently verified. Raw captures and full device-specific observations remain private.

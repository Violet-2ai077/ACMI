# DSH configuration binding and uncapped spending

## Observed local binding (2026-11-14)

- Installed package: @deepseek-ai/dsh 0.2.1-rc.2.
- Explicit profile patch: C:/Users/SiChuchen/.dsh/profiles/web/cordis.patch.yml.
- Default provider/model alias: opencode-go / deepseek-v4.1-flash; reasoning effort max.
- Catalog-derived API: openai-completions.
- Endpoint: https://opencode.ai/inference/go/v1/chat/completions.
- Credential reference: OPENCODE_GO_API_KEY, present in the selected DSH managed refs store.
- Local catalog indicates DeepSeek thinking format, max_tokens and assistant reasoning_content.

These are installed configuration facts, NOT a successful model request, verified pricing,
immutable weight snapshot, session-specific selection or complete effective Cordis profile.
Local declared context/output limits are not experiment token budgets or verified service limits.
Do not substitute an unrelated configured provider when this route fails.

## Read-only discovery

dsh-route.mjs selects exactly one default, one adapter, one provider and one model.
Unsupported credentials, headers, APIs, duplicate selections, non-HTTPS and URL credentials
fail closed. It exports a fresh allowlist, never the original provider map or raw profile.

dsh-inspect.mjs takes three explicit paths: installed DSH package.json, profile patch and
managed credential store. It uses only the installed YAML parser, without importing DSH,
mounting Cordis, running JS tags, calling endpoints or reading sessions. Only the selected
credential reference is accessed. Managed refs precede the same named inherited environment
entry, matching the inspected credential service. No dotenv search, OAuth store, backup,
other-provider credential, raw credential file or credential hash is exported.

This is intentionally a narrow profile-patch inspector, not a general DSH configuration
resolver. Runtime/global overlays and active-session overrides are not certified. Errors
are replaced with fixed text because YAML exceptions may quote secret-bearing source lines.
Unit loader tests use a JSON-only YAML stand-in; one separate local read checks the installed
YAML parser and actual selected profile without sending a request.

## Uncapped ledger policy

New runs may explicitly use:

```json
{
  "mode": "uncapped",
  "maxCalls": null,
  "maxCostMicros": null,
  "currency": "USD",
  "scheduledCalls": 2,
  "authorizationRef": "owner-2026-11-14"
}
```

The two-call example is a synthetic engineering trace, not the approved research schedule
or a verified currency declaration. Ledger accepts a finite positive scheduled count;
the current planner still defines only the 576-call proposal. Actual coordinate membership
must be enforced by the future send boundary using the frozen plan, not count alone.

This policy creates gate2-run-v2. Per-attempt maxCostMicros must be null. Successful calls
may settle with unknown actual cost; chargedMicros remains null and unknownCostCalls is
reported separately from knownChargedMicros. No missing cost becomes zero and no infinite
budget is serialized as a number. Monetary records retain safe-integer representation bounds.
Unknown transport outcome or error still halts; unfinished reservations, duplicate coordinates,
schedule exhaustion and changed resume policy still reject. No retry or evidence deletion.

Old bounded gate2-run-v1 behavior and manifest bytes remain unchanged. Neither mode is a live
runner: evidenceKind stays offline-ledger-test. No SDK retry policy or DSH Host is reused.

## Remaining send-boundary work

Implement a dedicated single-send transport with mock-wire tests, raw SSE retention, exact
content/reasoning separation, usage/finish handling, abort handling and no automatic retry.
Preserve reasoning history as required by the selected route without exposing private
reasoning as user-visible answers or allowing it to become attribution markers. Freeze
transport parameters and actual prompts before experiments. Human-reviewed corpus records
and independently retained freeze pins remain prerequisites, not outputs of this inspector.

# Third-party notices

The root [MIT license](LICENSE) covers ACMI-original material. It does not
replace the following notices or licenses of separately installed dependencies.

## DeepSeek Harness (dsh)

- Upstream: [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- Baseline: `0.2.2-rc.1`, commit `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`.
- License: [MIT at the pinned commit](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/LICENSE), Git blob `c1f7a78e89e4e4dc7b86664c3b3c76eb5eee1785`.
- Reuse: the dsh Storage Adapter's `integrations/dsh/src/journal-format.ts`
  reuses the `encodeSegment` and `projectKey` path helpers from
  [`packages/session/session-persistence-jsonl/src/format.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/session/session-persistence-jsonl/src/format.ts)
  and adapts its generation filename conventions. The independent reader uses
  published format and catalog packages for strict v4 validation. The upstream
  persistence backend and its write and migration code are not vendored. dsh
  runtime packages remain external dependencies, subject to their own package
  notices. The integration also carries its own [copy of the MIT notice](integrations/dsh/DSH-LICENSE).

```text
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Contributor Covenant

[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) is a shortened, reworded adaptation of
[Contributor Covenant v3.0](https://www.contributor-covenant.org/version/3/0/code_of_conduct/),
stewarded by the Organization for Ethical Source and licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The
adaptation uses the same license and adds ACMI-specific reporting guidance.

## Installed dependencies

Exact package versions and integrity data are in [pnpm-lock.yaml](pnpm-lock.yaml).
The source release does not redistribute `node_modules`, native binaries, or a
bundled distribution. Separately installed packages retain their own licenses.
The audited installed tree includes MIT, BSD-3-Clause, ISC, 0BSD, Apache-2.0,
Python-2.0 (`argparse` 2.0.1), and MPL-2.0 (Lightning CSS 1.33.0 and its
platform build). Koffi 3.1.1 is an external MIT dependency of the pinned dsh
tree; the workspace permits no Koffi install hook and uses its optional
platform package where available.

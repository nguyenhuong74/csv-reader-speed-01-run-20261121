# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/nguyenhuong74/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/nguyenhuong74/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's csv-reader 1.0.0: `solve.js` answers every
case exactly as the reference does — the same `{columns, rows, errors}` for
every `{text, header}`, including every broken-row case (stray CRs,
unterminated quotes, quote junk, short and long rows, embedded line breaks,
BOM) — and reads the text in a single left-to-right pass, taking each field
out with `slice()` instead of rebuilding it one character at a time. On the
practice set it runs about 5x faster than the reference.

## Run it

```sh
node main.ts
```

`main.ts` (the house driver, kept as the kit ships it) reads every case from
`/input/cases.json`, answers each with `run` from `solve.js`, and writes
`/output/answers.json`. Outside a container, `MAKEFUN_INPUT_DIR` and
`MAKEFUN_OUTPUT_DIR` stand in for `/input` and `/output`. Node 22 or later,
no dependencies, no network.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>

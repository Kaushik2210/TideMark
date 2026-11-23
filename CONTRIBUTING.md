# Contributing to Tidemark

The most useful contribution is a **dated, sourced report** of what happened at a lake (drained, overflowed,
foamed, burned, built on). Tidemark tests its satellite signals against such reports, and more of them make
the checks stronger, including when they show the satellites are wrong.

Use the issue forms: **Report a dated lake event**, **Share what you saw at a lake**, or **Something looks wrong
in the data** (GitHub: New issue). The same links are on the site's Contribute page.

Rules that keep this honest:
- Only public sources, with a link and a date. No claims without a source.
- No personal data (names of private people, faces, number plates, home addresses). Crop photos; they can
  carry location data.
- Do not accuse a person or company of anything the source itself does not say.
- Tidemark is research, not an official assessment, and does not decide boundaries or water safety.

Code changes: see [README.md](README.md) for setup, run `ruff check` and `pytest` in `pipeline/`, and
`npm run lint`, `npm run typecheck` and `npm run test:e2e` in `web/`. Record non-obvious decisions in
[DECISIONS.md](DECISIONS.md).

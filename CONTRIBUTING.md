# Contributing to OpenCook

Anyone can cook. Fork the repo, make your change, open a pull request. That's it.

## How to contribute

1. **Fork** this repo on GitHub.
2. **Make your change** in your fork. Using an AI assistant? Point it at `CLAUDE.md` first — it explains the whole project.
3. **Open a pull request** back to this repo and say what you changed and why.

The maintainer will run it, may adjust it, and merges what fits. Edits made to your work are added as separate commits, so the record always shows what you did.

Not a coder? Ideas, designs and mockups are welcome too — post them on [opencook.fun](https://opencook.fun) or open an issue.

## Credit

Every merged contribution is permanently recorded in the git history under your GitHub account. Merges always keep your original commits (no squashing), so your work stays attributed to you.

**Optional — where to send rewards:** if you'd like any future rewards to reach you, add this line to your GitHub profile bio:

```
OpenCook: <your BSV address>
```

You can add it any time, now or later. Your contributions are recorded either way.

## Please

- **Never commit secrets** — no keys, passwords or `.env` files.
- **Ask first** (open an issue) before adding new libraries, or changing anything that handles money, keys or identity (`src/services/bsv/`, `src/services/fairness/`, `src/app/api/boot-confirm/`). These get a careful security review.
- **Don't reformat files you didn't change.** Mass reformatting makes it harder to see who wrote what.
- **Keep the history intact if you fork.** Fork rather than copy, and don't rewrite or squash past commits, so everyone's credit travels with the code.

## The fine print

- Contributions are licensed under this project's [MIT License](LICENSE), the same as the rest of the code.
- Contributing is voluntary. It does not create any employment, contractor, partnership or ownership relationship.
- Any future reward is at the maintainer's sole discretion, may never happen, and the method may change. Nothing here is a promise of payment, equity, revenue share, or any claim on the project or its income.

## Security issues

Found a vulnerability? Please don't open a public issue — see [SECURITY.md](SECURITY.md).

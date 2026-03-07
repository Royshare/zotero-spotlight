# Contributing to Zotero Spotlight

Thanks for your interest in improving Zotero Spotlight.

The project is still evolving, so small bug fixes, polish, documentation improvements, and focused feature proposals are all welcome.

## Before you start

- Check existing issues and pull requests first to avoid duplicated work.
- For larger changes, open an issue or start a discussion before investing heavily.
- Keep contributions aligned with the project's core goal: fast, keyboard-first navigation inside Zotero.

## Local setup

1. Fork and clone the repository.
2. Install dependencies:

```bash
npm install
```

3. Create a local environment file from `.env.example`:

```bash
cp .env.example .env
```

4. Fill in the required Zotero paths in `.env`.
5. Start the development server:

```bash
npm run start
```

## Useful commands

- `npm run start` - run the plugin in development mode
- `npm run build` - create a production build and run TypeScript checks
- `npm run lint:check` - run Prettier and ESLint in check mode
- `npm run lint:fix` - auto-format and auto-fix lint issues before opening a PR
- `npm run test` - run the test suite

## Coding expectations

- Keep changes focused and scoped to a clear problem.
- Follow the existing code style and project structure.
- Run `npm run lint:fix` before submitting changes.
- Run `npm run build` for code changes.
- If your change affects behavior, run `npm run test` when possible.

## Pull requests

When opening a pull request:

- explain the problem and the approach clearly
- link any relevant issue
- include screenshots or a short GIF for UI changes when helpful
- mention your test steps, especially if you verified behavior in Zotero 7 or Zotero 8
- keep the PR focused; separate unrelated cleanup into another PR

## Reporting bugs and suggesting features

- Use the GitHub issue templates when possible.
- For bug reports, include your OS, Zotero version, plugin version, and steps to reproduce.
- For feature requests, describe the workflow problem first, then the proposed behavior.

Thanks for helping make Zotero Spotlight better.

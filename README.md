# Pocket Library — simple-app lab

A deliberately small React/TypeScript/Vite app for experimenting with procedural LLM/Jev stages.

## Baseline

- One page displaying three fixed books and their authors.
- No editing, forms, filters, routing, persistence, or external APIs.
- No hidden actions or placeholder buttons.
- `src/App.tsx` owns the static list; `src/main.tsx` mounts it; `src/styles.css` styles it.

This fresh `lab/simple-app` branch starts from main and replaces the old single-page features.
The richer app remains on `lab/expanded-baseline`; earlier experiment branches are preserved.
Existing browser storage is neither read nor changed. No migration or reset of user data is needed.

## Commands

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

The tests render the actual component with React's server renderer. They verify the three-book
baseline, semantic grouping, absence of controls, and repeatable output. Browser layout, navigation,
and deployment behavior are not established by these checks.

This baseline does not yet run the new procedural chain.

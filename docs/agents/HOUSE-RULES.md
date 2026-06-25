# HOUSE RULES — read before doing anything

You are one of 5 parallel agents on **ARC90**, a local-first habit PWA (vanilla JS/CSS, **no framework, no bundler**).

- App: `js/app.js` (~6k lines), `js/data.js`, `css/styles.css`
- Backend: `/api/*.js` (Vercel serverless), Supabase project `agnnqsqjcobfmfyijsrs`
- Prod: `arc90.vercel.app/app` · Landing: `arc90.vercel.app`
- Design: **obsidian premium** — near-black `#07080C`, gradient cobalt→violet→magenta used sparingly. Tokens: `--accent/-2/-soft/-line`, `--tx/-2/-3`, `--line/-2`, `--mint`, `--amber`, `--red` (+ `-soft`), `--card/-2`, `--r-lg`.
- Strategy + backlog context: `docs/arc90-operating-system.md`

## Non-negotiable rules

1. **Stay in your lane.** Only edit files in your OWNED list (see `README.md` and your brief). If you must touch a shared file, change only your named functions/sections. Never refactor another agent's code.
2. **Your branch only.** Commit small and often. **Never push to `main`, never deploy, never bump the cache version** (`index.html ?v=` or `sw.js CACHE`). The Release agent does all of that.
3. **Match existing patterns.** Vanilla JS, the delegated `data-act` click handler, the existing CSS tokens. No React/Tailwind/new dependencies.
4. **npm is not on PATH.** Prefix every node/npm command with:
   `PATH=/Users/michael28gh/.nvm/versions/node/v24.14.1/bin:$PATH`
5. **Verify before "done."** Run `node --check js/app.js`; if your change is visible, verify it in the Launch preview. State exactly what you checked.
6. **Compliance is firm.** Protocol/Vitals are **track-only** — never dosing/medical advice. Health data stays local.
7. **Never paste or commit secrets.** Keys live in Vercel/Supabase env. `.env.local` and `.vercel/` stay gitignored.
8. **Pull `main` into your branch** before each session; keep changes small so merges are trivial.
9. End commit messages with:
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## Ship workflow (Release agent only)
edit → `node --check` → `npm run check` → `npm run build` → preview-verify → `npm run deploy:prod` → confirm READY → commit → `git push origin main`.

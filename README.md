# Dawn — Wake up knowing what to do

Dawn is an AI Instagram manager. Every morning it reads your account, tells you
what changed, and hands you a ranked plan of action.

This is the MVP: a live landing page with a working "Good Morning" briefing demo,
a briefing engine (Gemini-powered with a rule-based fallback), and a swappable
data layer that runs on mock data now and real Instagram data after Meta App Review.

## Stack (all free)
- Next.js 14 + TypeScript
- Tailwind CSS
- Google Gemini (free tier) — optional; falls back to rule-based briefs
- Deploys free on Vercel

## Run locally
```bash
npm install
npm run dev
# open http://localhost:3000
```

## Deploy free on Vercel
1. Push this folder to your GitHub repo.
2. Go to vercel.com, "New Project", import the repo.
3. Deploy. You get a live URL like https://dawn.vercel.app

## Optional: enable AI briefings
Add a free Gemini key at https://aistudio.google.com/apikey, then set the
`GEMINI_API_KEY` environment variable in Vercel (Project Settings → Environment
Variables). Without it, Dawn uses its built-in rule-based briefing.

## Architecture note
`lib/data-provider.ts` is the swap layer. It returns mock data today. After Meta
App Review, implement `InstagramGraphProvider` with the same interface and change
one line in `getProvider()`. Nothing else changes.

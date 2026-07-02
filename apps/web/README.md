# @listinglogic/web

Operator dashboard for the Streamline Probate Engine.

## Stack

- **React 18** + **Vite 5** + **TypeScript 5.3**
- **TanStack Query 5** — server state
- **React Router 6** — client-side routing
- **Firebase Auth** — authentication
- **Recharts** — analytics visualization

## Development

    pnpm install
    cp apps/web/.env.example apps/web/.env
    pnpm dev:web

Runs on `http://localhost:5173` with API proxy to `http://localhost:8080`.

## Building

    pnpm --filter @listinglogic/web build

Output in `apps/web/dist/`. Deploy to Firebase Hosting, Vercel, Netlify, or any static host.

## Architecture

    apps/web/src/
    ├── api/          Typed API client modules per domain
    ├── hooks/        TanStack Query hooks
    ├── context/      React Context (auth, toasts)
    ├── components/   Reusable UI + Layout
    ├── pages/        Route pages
    ├── lib/          Firebase, env, api client
    ├── theme.ts      Design tokens
    └── App.tsx       Router + providers

Every network call goes through `lib/api-client.ts` which attaches Firebase JWT and correlation IDs automatically.

## Testing

    pnpm --filter @listinglogic/web test

Coverage thresholds: 70% lines/functions/statements, 65% branches.

## Firebase Hosting deploy

    pnpm --filter @listinglogic/web build
    firebase deploy --only hosting

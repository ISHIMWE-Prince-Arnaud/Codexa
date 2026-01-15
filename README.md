# Codexa

Codexa is an interactive code editor + snippet library built with Next.js, Clerk auth, and a Convex backend.

## Features

- **In-browser code editor** (Monaco) with themes, language switching, and per-language local persistence
- **Code execution** via the Piston API (`https://emkc.org/api/v2/piston/execute`)
- **Share snippets** to a public library
- **Snippet details** with read-only viewer, copy button, and comments
- **Stars** for snippets + a profile page with stats and execution history
- **Pro gating** (non-JavaScript languages require Pro; upgraded via Lemon Squeezy webhook)

## Tech stack

- **Next.js** (App Router) + **React**
- **Tailwind CSS** + **Framer Motion**
- **Clerk** for authentication
- **Convex** for database + server functions
- **Zustand** for client state

## Getting started

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment variables

Copy `.env.example` to `.env.local` and fill in values:

```bash
copy .env.example .env.local
```

**Required variables**

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SECRET`
- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- `LEMON_SQUEEZY_WEBHOOK_SECRET`

Note: any `NEXT_PUBLIC_*` env var is exposed to the browser.

### 3) Run Convex (backend)

In one terminal:

```bash
npx convex dev
```

### 4) Run Next.js (frontend)

In another terminal:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Webhooks

Convex HTTP routes are defined in `convex/http.ts`:

- **Clerk webhook**: `/clerk-webhook`
  - Used to sync newly created Clerk users into the Convex `users` table.
  - Requires `CLERK_WEBHOOK_SECRET`.
- **Lemon Squeezy webhook**: `/lemon-squeezy-webhook`
  - Used to upgrade users to Pro on `order_created`.
  - Requires `LEMON_SQUEEZY_WEBHOOK_SECRET`.

## Scripts

- **`npm run dev`**: start Next.js dev server
- **`npm run build`**: build for production
- **`npm run start`**: start production server
- **`npm run lint`**: run ESLint

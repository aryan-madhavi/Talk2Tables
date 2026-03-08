# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Vite dev server
npm run build    # Production build
```

No test runner or lint script is configured in `package.json`.

## Environment Variables

Create a `.env` file at the project root with:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_API_BASE_URL=http://localhost:8000/api/v1/auth
```

## Architecture

This is a **React 18 + TypeScript + Vite** SPA. The backend is a separate FastAPI service expected at `http://localhost:8000/api/v1`.

### Entry point & app shell

- `src/main.tsx` → mounts `App.tsx`
- `src/app/App.tsx` → wraps `<RouterProvider>` inside `<AuthProvider>`. The `AuthProvider` must be the outermost wrapper so every route has auth state.
- `src/app/routes.tsx` → all route definitions. Public route: `/login`. Everything under `/` is wrapped in `<ProtectedRoute>`. The `/admin` route additionally requires `requiredRole="db_manager"`.

### Authentication flow

Dual-layer auth: **Firebase Auth** (client SDK) + **Firestore session** (backend).

1. `signInWithEmailAndPassword` → Firebase ID token
2. `POST /api/v1/auth/login` → backend verifies token, creates Firestore session, returns `custom_token` + `session_id`
3. `signInWithCustomToken` → re-authenticates so subsequent ID tokens carry the RBAC `role` claim
4. Session ID stored in a JS cookie (`t2t_session_id`, `SameSite=Strict`, 1-hour `Max-Age`)

On every page load/refresh, `AuthContext` runs `onAuthStateChanged` → `checkTokenActive` → `getMe` before `loading` is set to `false`. **`ProtectedRoute` must never redirect while `loading === true`** — Firebase needs up to ~1–2 s to restore its cached IndexedDB session.

### RBAC roles (ascending privilege)

```
analyst  <  power_user  <  db_manager  <  admin
```

`useAuth()` exposes `isAnalyst`, `isPowerUser`, `isDbManager`, `isAdmin` convenience booleans. `ProtectedRoute` uses a numeric level map for the hierarchy check.

### Service layer (`src/lib/`)

Each file owns one backend resource domain. All use the same `apiFetch` pattern (Firebase ID token in `Authorization: Bearer`, auto-refresh on 401):

| File | Base path | Domain |
|------|-----------|--------|
| `authService.ts` | `/api/v1/auth` | Login, logout, session check, user profile |
| `connectionService.ts` | `/api/v1` | Database connection CRUD |
| `accessService.ts` | `/api/v1` | Per-user connection access grants |
| `userService.ts` | `/api/v1` | User management (admin) |

`connectionService.ts` derives its base URL by replacing `/auth` in `VITE_API_BASE_URL`, so the env var format (`/auth` suffix) matters.

### Pages (`src/app/pages/`)

| Route | Page | Notes |
|-------|------|-------|
| `/` | `Dashboard` | Overview stats |
| `/query` | `QueryInterface` | Chat UI + SQL result panel. Currently uses mock data from `src/app/data/mockData.ts`. Split into `ChatHeader`, `ChatMessages`, `ChatInput`, `ResultPanel` + `useQueryExecution` hook. |
| `/history` | `History` | Query history |
| `/schema` | `SchemaBrowser` | Table/column explorer |
| `/admin` | `AdminPanel` | Tabs: Users, Databases, Stats, Audit. Requires `db_manager`+ role. |
| `/settings` | `Settings` | User settings |

### Component layers

- `src/app/components/ui/` — shadcn/ui primitives (Radix UI wrappers). Do not modify these directly; they are generated components.
- `src/app/components/layout/` — `AppLayout` (sidebar + outlet), `Sidebar`, `MobileNav`, `ProtectedRoute`
- `src/app/components/shared/` — reusable app-level components (`WelcomeBanner`, `Field`, etc.)

### Path alias

`@` maps to `src/` (configured in `vite.config.ts`).

### Styling

Tailwind CSS v4 via `@tailwindcss/vite` plugin. Theme tokens are in `src/styles/theme.css`. Use `cn()` from `src/app/components/ui/utils.ts` (re-exported from `src/lib/utils.ts`) for conditional class merging.

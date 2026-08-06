```markdown
# Oria.HQ.Michael.HQ-APP Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill provides a comprehensive guide to the development patterns, coding conventions, and core workflows used in the Oria.HQ.Michael.HQ-APP repository. The project is a TypeScript-based Next.js application with a strong emphasis on architectural clarity, modularity, and maintainability. It features robust workflows for database migrations, API development, documentation, and type management, all supported by a consistent code style and automated testing.

## Coding Conventions

- **Language:** TypeScript
- **Framework:** Next.js
- **File Naming:** Use `kebab-case` for all files (e.g., `user-profile.ts`, `api-handler.ts`)
- **Import Style:** Use path aliases for imports.

  ```typescript
  import { getUser } from '@/server/user-service';
  import type { User } from '@/core/types';
  ```

- **Export Style:** Prefer named exports.

  ```typescript
  // Good
  export function getUser() { ... }
  export type User = { ... };

  // Avoid default exports
  ```

- **Commit Messages:** Follow [Conventional Commits](https://www.conventionalcommits.org/) with prefixes such as `feat`, `chore`, `fix`, `refactor`, `ci`, `merge`, `docs`.

  ```
  feat(api): add endpoint for user onboarding
  fix(db): correct migration for policy changes
  ```

## Workflows

### Database Migration Workflow
**Trigger:** When introducing a new database table, changing schema, or updating security policies  
**Command:** `/new-table`

1. Author a new migration SQL file in `db/migrations/` (e.g., `20240601_add_users_table.sql`).
2. Optionally, add verification (`*_verify.sql`) and revert (`*_revert.sql`) scripts for the migration.
3. Update related documentation:
    - `docs/SECURITY_FINDINGS.md` for policy/security changes
    - `docs/runbooks/*.md` for operational procedures
    - `ARCHITECTURE.md` for schema overview
4. Reference migration status and live-apply instructions in the documentation.

**Example:**
```sql
-- db/migrations/20240601_add_users_table.sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### API Endpoint Addition Workflow
**Trigger:** When adding a new API endpoint or execution path  
**Command:** `/add-endpoint`

1. Create or update a route handler in `src/app/api/...` (e.g., `src/app/api/users/route.ts`).
2. Implement or update related service/repository logic in `src/server/...`.
3. Write or update tests for the new endpoint and logic (see [Testing Patterns](#testing-patterns)).
4. Update type definitions in `src/server/db/types.ts` or related files if needed.

**Example:**
```typescript
// src/app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getUsers } from '@/server/user-service';

export async function GET(req: NextRequest) {
  const users = await getUsers();
  return NextResponse.json(users);
}
```

---

### Documentation and System Map Update Workflow
**Trigger:** When changing core architecture, merging major branches, or refactoring dependencies  
**Command:** `/update-system-map`

1. Update `ARCHITECTURE.md` to reflect new or changed structure.
2. Regenerate `docs/SYSTEM_MAP.md` and `docs/system-map.json` using scripts in `scripts/architecture/`.
    - Example: `node scripts/architecture/generate-system-map.mjs`
3. Update or add related scripts in `scripts/architecture/` as needed.
4. Update `package.json` scripts if necessary.

---

### Type Relocation and Layering Enforcement Workflow
**Trigger:** When cleaning up type dependencies or enforcing architectural layering  
**Command:** `/enforce-layering`

1. Move or consolidate shared type definitions into `src/core/types.ts`.
2. Update all import paths in server and feature files to reference the new location.
3. Update or add CI scripts (e.g., `scripts/architecture/check-layering.mjs`) to enforce layering rules.
4. Document changes in `ARCHITECTURE.md`.

**Example:**
```typescript
// src/core/types.ts
export type User = {
  id: number;
  email: string;
  createdAt: Date;
};

// src/server/user-service.ts
import type { User } from '@/core/types';
```

---

## Testing Patterns

- **Framework:** [Vitest](https://vitest.dev/)
- **Test Files:** Use the pattern `*.test.ts` and place tests alongside the code or in dedicated test directories.
- **Example:**
  ```typescript
  // src/server/user-service.test.ts
  import { describe, it, expect } from 'vitest';
  import { getUser } from './user-service';

  describe('getUser', () => {
    it('returns user by id', async () => {
      const user = await getUser(1);
      expect(user).toMatchObject({ id: 1 });
    });
  });
  ```

## Commands

| Command            | Purpose                                                        |
|--------------------|----------------------------------------------------------------|
| /new-table         | Start a database migration workflow                            |
| /add-endpoint      | Add a new API endpoint and related logic/tests                 |
| /update-system-map | Update documentation and regenerate the system map             |
| /enforce-layering  | Refactor types and enforce architectural layering via CI rules |
```

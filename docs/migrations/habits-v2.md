# Migration: Habits v2 (`20261101120000_habits_v2`)

Habits go from "a checkbox with a Daily/Weekly toggle" to habits with goals, schedules,
reminders and a per-day history (streaks, stats, tracker). This migration adds the
columns and the history table, and converts existing habits in place — no data is dropped.

File: [`prisma/migrations/20261101120000_habits_v2/migration.sql`](../../prisma/migrations/20261101120000_habits_v2/migration.sql)
Requires: PostgreSQL 13+ (the backfill uses `gen_random_uuid()`).

## Schema changes

### `Habit` — new columns (all nullable or defaulted, safe on existing rows)

| Column | Type | Default | Meaning |
|---|---|---|---|
| `description` | `TEXT` | null | Optional description |
| `emoji` | `TEXT` | null | Icon shown on the card |
| `color` | `TEXT` | null | Palette key (`habitColors.ts`); null = theme accent |
| `groupName` | `TEXT` | null | Optional group (filter chips) |
| `kind` | `TEXT` | `'build'` | `build` \| `quit` |
| `goalPeriod` | `TEXT` | `'day'` | `day` \| `week` \| `month` |
| `goalValue` | `DOUBLE PRECISION` | `1` | Amount per period (quit: the most allowed) |
| `goalUnit` | `TEXT` | `'times'` | `times`, `min`, `h`, `ml`, `km`, `steps`, `pages` or custom |
| `taskDays` | `INTEGER[]` | `{}` | Due weekdays, 0 = Sun … 6 = Sat; empty = every day |
| `timeRange` | `TEXT` | `'anytime'` | `anytime` \| `morning` \| `afternoon` \| `evening` |
| `remindersOn` | `BOOLEAN` | `false` | Reminders enabled |
| `reminderTimes` | `TEXT[]` | `{}` | `"HH:MM"` times |
| `reminderMessage` | `TEXT` | null | Notification text |
| `memoOnComplete` | `BOOLEAN` | `false` | Ask for a memo after check-in |
| `barAction` | `TEXT` | `'done'` | Card button: `done` \| `add` |
| `chartType` | `TEXT` | `'bar'` | `bar` \| `line` |
| `startDate` | `TEXT` | null | `YYYY-MM-DD`, due days start here |
| `endDate` | `TEXT` | null | `YYYY-MM-DD`, null = no end |
| `archived` | `BOOLEAN` | `false` | Hidden from Today, kept in stats |
| `templateKey` | `TEXT` | null | Template it was created from |

`checked` and `weekly` stay but are **deprecated** — the app no longer reads them. Drop them in a later migration once v2 has been live for a while.

### `HabitLog` — new table

One row per habit per day. Keyed by the habit's `localId` (no FK to `Habit`, because the habits sync deletes and re-creates `Habit` rows on every save — same reason as `TaskCompletion`).

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT` PK | cuid |
| `userId` | `TEXT` | FK → `User.id`, `ON DELETE CASCADE` |
| `habitLocalId` | `TEXT` | `Habit.localId` |
| `date` | `TEXT` | `YYYY-MM-DD` |
| `value` | `DOUBLE PRECISION` | Amount logged, default `0` |
| `skipped` | `BOOLEAN` | Day skipped on purpose, default `false` |
| `memo` | `TEXT` | Optional |
| `rowCreatedAt` / `rowUpdatedAt` | `TIMESTAMP(3)` | |

Indexes: unique `(userId, habitLocalId, date)`, plus `(userId, date)`.

### `HabitMeta` — new column

| Column | Type | Default | Meaning |
|---|---|---|---|
| `checkInMethod` | `TEXT` | `'tap'` | `tap` \| `swipe` |

`lastDailyResetYMD` / `lastWeeklyResetYMD` stay but are **deprecated** (v1's daily/weekly reset).

### `Reminder`

No changes.

## Data backfill (runs inside the same migration)

1. **Delete blank habits** (`btrim(text) = ''`) — v1 always kept one empty placeholder row.
2. **Weekly → week goal**: `weekly = true` ⇒ `goalPeriod = 'week'`.
3. **`startDate`** = the earlier of the row's save date and the user's `lastDailyResetYMD`.
4. **Checked habits become history**: each `checked = true` habit gets one `HabitLog` row (`value = 1`) on the user's `lastDailyResetYMD` (the day that check belonged to), else on the row's last save date.

## Deploying to production

Nothing applies migrations automatically (`npm run build` only runs `prisma generate`), so:

1. **Back up** the database:
   ```bash
   pg_dump "$DATABASE_URL_PROD" -Fc -f youtask-before-habits-v2.dump
   ```
2. **Record counts** to compare afterwards:
   ```sql
   SELECT count(*) AS habits,
          count(*) FILTER (WHERE btrim(text) = '') AS blank,
          count(*) FILTER (WHERE weekly)  AS weekly,
          count(*) FILTER (WHERE checked) AS checked
   FROM "Habit";
   ```
3. **Apply** (migrate first, then deploy the app):
   ```bash
   DATABASE_URL="<prod url>" npx prisma migrate deploy
   ```
4. **Verify**:
   ```sql
   SELECT count(*) FROM "Habit";                              -- = habits - blank
   SELECT count(*) FROM "Habit" WHERE "goalPeriod" = 'week';  -- = weekly
   SELECT count(*) FROM "HabitLog";                           -- = checked (non-blank)
   SELECT count(*) FROM "Habit" WHERE "startDate" IS NULL;    -- = 0
   SELECT "checkInMethod", count(*) FROM "HabitMeta" GROUP BY 1;
   ```
5. **Deploy the app.**

### Order and compatibility

- The **old app keeps working** against the new schema (old columns are kept; new ones have defaults). So migrating first is safe.
- The **new app needs** the new columns and `HabitLog`, so don't deploy it before the migration.
- A browser still on the old app, posting habits after the migration, would reset the new fields of those habits to defaults (v1 posts only `text/checked/weekly`). Users get the new app on their next reload (`UpdateChecker`), so keep the gap between migrate and deploy short.

### Rollback

The migration only adds things, plus the backfill. To undo:

```sql
DROP TABLE "HabitLog";
ALTER TABLE "HabitMeta" DROP COLUMN "checkInMethod";
ALTER TABLE "Habit"
  DROP COLUMN "description", DROP COLUMN "emoji", DROP COLUMN "color", DROP COLUMN "groupName",
  DROP COLUMN "kind", DROP COLUMN "goalPeriod", DROP COLUMN "goalValue", DROP COLUMN "goalUnit",
  DROP COLUMN "taskDays", DROP COLUMN "timeRange", DROP COLUMN "remindersOn", DROP COLUMN "reminderTimes",
  DROP COLUMN "reminderMessage", DROP COLUMN "memoOnComplete", DROP COLUMN "barAction", DROP COLUMN "chartType",
  DROP COLUMN "startDate", DROP COLUMN "endDate", DROP COLUMN "archived", DROP COLUMN "templateKey";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261101120000_habits_v2';
```

The deleted blank placeholder rows aren't restored (they held no text); restore the dump from step 1 if an exact copy is needed.

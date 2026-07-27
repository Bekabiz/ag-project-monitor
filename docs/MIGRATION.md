# Moving AG Project Monitor to a new Supabase project

The whole system points at one database. Moving it means recreating the
schema, copying auth users with their original IDs, copying data and files,
then repointing three places at the new project.

The order below is not arbitrary — each step depends on the one before it.

---

## Why UUIDs must be preserved

Six tables reference users by UUID: `steps.assigned_to`, `steps.created_by`,
`steps.updated_by`, `entries.user_id`, `step_notes.user_id`,
`general_updates.user_id`, `manager_plans.user_id`, `announcements.user_id`.

If the new project generates fresh IDs for the four accounts, every one of
those references breaks and has to be rewritten by hand. Creating the auth
users with their existing UUIDs avoids all of it.

---

## 1. Create the project and apply the schema

Create the project, then run `supabase/migrations/*.sql` in numerical order
in the SQL editor.

| File | What it does |
|---|---|
| `001_initial_schema.sql` | Tables |
| `002_indexes_and_views.sql` | Indexes and the dashboard view |
| `003_rls_policies.sql` | Row level security |
| `004_push_subscriptions.sql` | Web push subscriptions |
| `005_semantic_search.sql` | pgvector, `match_entries()`, index |
| `006_align_columns.sql` | Columns 001 was missing |
| `007_storage.sql` | `files` bucket and its policies |

Confirm before moving on:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```

---

## 2. Recreate the auth users

Password hashes do not survive an API copy, so create the users directly and
set fresh passwords. Keep the UUIDs identical to the source.

Get them from the **old** project:

```sql
select u.id, u.email, p.full_name, p.role
from auth.users u join profiles p on p.id = u.id;
```

Then on the **new** project, one row per user:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '<UUID FROM SOURCE>',
  'authenticated','authenticated',
  '<email>',
  crypt('<password>', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}','{}',
  '','','',''
);

-- Required for email sign-in; without it login fails with no useful error.
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id,
                             last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email,
                          'email_verified', true, 'phone_verified', false),
       'email', u.id::text, now(), now(), now()
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id);
```

Verify every user has a password and an identity:

```sql
select p.full_name, u.email,
       (u.encrypted_password is not null) as has_password,
       (i.id is not null) as has_identity
from profiles p
join auth.users u on u.id = p.id
left join auth.identities i on i.user_id = p.id;
```

`profiles` rows are copied by the script in step 3 — but the auth users must
exist first, because `profiles.id` references them.

---

## 3. Copy data and files

```bash
SOURCE_URL=https://<old-ref>.supabase.co \
SOURCE_KEY=<old service_role key> \
TARGET_URL=https://<new-ref>.supabase.co \
TARGET_KEY=<new service_role key> \
node scripts/migrate.mjs --dry-run
```

The dry run reads everything and reports counts without writing. If the
numbers look right, drop `--dry-run`.

The script copies tables in foreign-key-safe order, rewrites storage URLs
from the old project ref to the new one, copies every file in the `files`
bucket, and compares row counts at the end. It exits non-zero on any
mismatch, so don't move on until it passes.

Embeddings are deliberately not copied — they're regenerated in step 5.

---

## 4. Repoint everything

Three places, all of which must change together:

**Vercel** — `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. Also `VITE_SUPABASE_URL`
and `VITE_SUPABASE_ANON_KEY` if they're set there.

**Railway** (the MCP server) — `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

**`src/lib/supabase.js`** — the URL and anon key are hardcoded as fallbacks.
If the `VITE_` vars aren't set in Vercel, these *are* the live values and the
frontend will keep using the old project no matter what else you change.

---

## 5. Re-index for semantic search

Entries need embeddings before semantic search returns anything. In the
browser console on the deployed app:

```javascript
(async () => {
  let n
  do {
    const r = await fetch('/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"backfill":true}'
    })
    const d = await r.json()
    n = d.count
    console.log(d)
  } while (n > 0)
  console.log('done')
})()
```

The daily cron also embeds 50 entries per run, so this only speeds things up.

---

## 6. Verify before decommissioning

- Every user can log in
- Photos and documents open (proves storage copied and URLs rewritten)
- Search returns results, including for words not literally in the text
- Creating a task fires a push notification
- The MCP server answers on `/health` and can list tasks

Push subscriptions are not migrated — they're device-specific and regenerate
when each person next opens the app.

Keep the old project until all of the above passes.

---

## Known gaps

`project_access` is in the schema and the copy list but unused by the app.

The old project's `steps.status` values must be one of
`not_started | in_progress | waiting | done`, and `entries.category` one of
`work_update | problem | decision | material | client_request | note`.
A check constraint rejects anything else, which will surface as a write error
during the copy rather than silent data loss.

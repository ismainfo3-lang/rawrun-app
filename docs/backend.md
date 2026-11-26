# Backend contract — initial migration
New project: rawrun-app (separate from historical projects).
Migration applied remotely: initial_private_profiles_and_runs.
Profiles: id (auth.users), display_name, username (unique), locale (es/en), running_level, running_goal, created_at.
Runs: id UUID (client-generated for idempotent sync), user_id, started_at, ended_at, active_seconds, distance_m, route JSON array, created_at.
Both tables have RLS enabled, no anonymous select and owner-only authenticated access. Verified policy counts: profiles 3; runs 4. Security advisor returned no lints at initial inspection. Real-user authorization tests are outstanding.
The local prototype uses temporary local IDs and does not upload data. The sync milestone must introduce stable UUIDs and a durable sync queue before enabling remote writes. Keep route data owner-only. Public profile summaries and moment metrics should be separate from private running data.

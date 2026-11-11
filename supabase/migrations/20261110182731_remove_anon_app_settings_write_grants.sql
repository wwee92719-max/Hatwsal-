/*
# Remove anonymous write grants on app settings

1. Changes
- Anonymous visitors keep read access to app settings but lose insert and update privileges, which were granted without a matching policy.
- Signed-in admins keep insert and update through their existing admin-only policies.

2. Security
- Prevents any non-admin caller from changing pricing or subscription values.
*/

REVOKE INSERT, UPDATE ON app_settings FROM anon;

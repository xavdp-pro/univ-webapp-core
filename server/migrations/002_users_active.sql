-- Users managed from the admin page: an `active` flag (a removed user is kept,
-- inactive, so AUTH_USERS cannot bring it back) and an update timestamp.

ALTER TABLE auth_users
  ADD COLUMN IF NOT EXISTS active TINYINT(1) NOT NULL DEFAULT 1 AFTER role,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

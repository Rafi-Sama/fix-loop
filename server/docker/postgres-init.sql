-- The API connects as app_user: no table ownership, no BYPASSRLS, so row-level security always applies.
-- Migrations and the background worker connect as the owner role.
CREATE ROLE app_user LOGIN PASSWORD 'app_user';
CREATE DATABASE fixloop_test OWNER owner;
GRANT CONNECT ON DATABASE fixloop TO app_user;
GRANT CONNECT ON DATABASE fixloop_test TO app_user;

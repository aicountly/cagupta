-- =============================================================================
-- CA Gupta Office Portal — Seed Data
-- Run AFTER schema.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Default roles
-- -----------------------------------------------------------------------------
INSERT INTO roles (name, display_name, permissions, is_system) VALUES
(
    'super_admin',
    'Super Administrator',
    '{"permissions": ["*"]}',
    TRUE
),
(
    'admin',
    'Administrator',
    '{"permissions": ["dashboard.view","clients.view","clients.create","clients.edit","clients.delete","services.view","services.create","services.edit","services.delete","documents.view","documents.upload","invoices.view","invoices.create","invoices.edit","calendar.view","calendar.create","credentials.view","registers.view","leads.view","leads.create","leads.edit","settings.view"]}',
    TRUE
),
(
    'manager',
    'Manager',
    '{"permissions": ["dashboard.view","clients.view","clients.create","clients.edit","services.view","services.create","services.edit","documents.view","documents.upload","invoices.view","invoices.create","calendar.view","calendar.create","registers.view","leads.view","leads.create"]}',
    TRUE
),
(
    'staff',
    'Staff',
    '{"permissions": ["dashboard.view","clients.view","services.view","services.edit","documents.view","calendar.view","calendar.create"]}',
    TRUE
),
(
    'viewer',
    'Viewer',
    '{"permissions": ["dashboard.view","clients.view","services.view","documents.view","invoices.view"]}',
    TRUE
)
ON CONFLICT (name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Super admin user  (password_hash = NULL — auth is handled by SUPER_ADMIN_EMAIL
-- constant; set a real bcrypt hash here if you want password-based login too)
-- -----------------------------------------------------------------------------
INSERT INTO users (name, email, password_hash, role_id, is_active, is_email_verified, login_provider)
SELECT
    'Rahul Gupta',
    'rahul@cagupta.in',
    NULL,
    r.id,
    TRUE,
    TRUE,
    'local'
FROM roles r
WHERE r.name = 'super_admin'
ON CONFLICT (email) DO NOTHING;

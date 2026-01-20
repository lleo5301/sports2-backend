-- Seed data for development environment
-- This file is loaded after init.sql

-- Create a sample team for testing (if not exists from init.sql)
INSERT INTO teams (name, program_name, conference, division, city, state, primary_color, secondary_color, created_at, updated_at)
VALUES (
    'Development University',
    'Dev Sharks',
    'Development Conference',
    'D1',
    'Dev City',
    'DC',
    '#1e40af',
    '#ffffff',
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

-- Create test users with known credentials
-- Password: password123 (bcrypt hash)
INSERT INTO users (email, password, first_name, last_name, role, phone, team_id, is_active, created_at, updated_at)
VALUES 
    ('admin@test.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Test', 'Admin', 'head_coach', '555-0001', 1, true, NOW(), NOW()),
    ('coach@test.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Test', 'Coach', 'assistant_coach', '555-0002', 1, true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Note: In development, use these credentials:
-- Email: admin@test.com or coach@test.com
-- Password: password

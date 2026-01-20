-- Initialize the collegiate baseball database
-- This script runs when the PostgreSQL container starts for the first time

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create a sample team for testing
INSERT INTO teams (name, program_name, conference, division, city, state, primary_color, secondary_color, created_at, updated_at)
VALUES (
    'University of Example',
    'The Shark Tank',
    'Example Conference',
    'D1',
    'Example City',
    'EX',
    '#1e40af',
    '#ffffff',
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

-- Create a sample head coach user
-- Note: Password will be hashed by the application
INSERT INTO users (email, password, first_name, last_name, role, phone, team_id, is_active, created_at, updated_at)
VALUES (
    'headcoach@example.edu',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- password: password
    'John',
    'Smith',
    'head_coach',
    '555-0123',
    1,
    true,
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

-- Create a sample assistant coach user
INSERT INTO users (email, password, first_name, last_name, role, phone, team_id, is_active, created_at, updated_at)
VALUES (
    'assistant@example.edu',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- password: password
    'Jane',
    'Doe',
    'assistant_coach',
    '555-0124',
    1,
    true,
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

-- Create some sample players
INSERT INTO players (first_name, last_name, school_type, position, height, weight, birth_date, graduation_year, school, city, state, phone, email, batting_avg, home_runs, rbi, stolen_bases, era, wins, losses, strikeouts, innings_pitched, team_id, created_by, status, created_at, updated_at)
VALUES 
    ('Mike', 'Johnson', 'HS', 'SS', '6-1', 185, '2006-03-15', 2024, 'Example High School', 'Example City', 'EX', '555-0001', 'mike.johnson@email.com', 0.385, 12, 45, 15, NULL, NULL, NULL, NULL, NULL, 1, 1, 'active', NOW(), NOW()),
    ('Sarah', 'Williams', 'COLL', 'P', '5-8', 150, '2003-07-22', 2025, 'University of Example', 'Example City', 'EX', '555-0002', 'sarah.williams@example.edu', NULL, NULL, NULL, NULL, 2.45, 8, 3, 95, 65.2, 1, 1, 'active', NOW(), NOW()),
    ('David', 'Brown', 'HS', 'CF', '6-0', 175, '2006-11-08', 2024, 'Another High School', 'Another City', 'EX', '555-0003', 'david.brown@email.com', 0.420, 8, 38, 22, NULL, NULL, NULL, NULL, NULL, 1, 1, 'active', NOW(), NOW()),
    ('Emily', 'Davis', 'COLL', 'C', '5-6', 140, '2003-01-30', 2025, 'University of Example', 'Example City', 'EX', '555-0004', 'emily.davis@example.edu', 0.315, 5, 28, 3, NULL, NULL, NULL, NULL, NULL, 1, 1, 'active', NOW(), NOW()),
    ('Alex', 'Garcia', 'HS', '3B', '6-2', 190, '2006-05-12', 2024, 'Third High School', 'Third City', 'EX', '555-0005', 'alex.garcia@email.com', 0.395, 15, 52, 8, NULL, NULL, NULL, NULL, NULL, 1, 1, 'active', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Create a sample daily report
INSERT INTO daily_reports (team_id, created_by, report_date, report_type, title, weather, temperature, opponent, location, start_time, end_time, duration_minutes, activities, highlights, concerns, next_steps, players_present, players_absent, is_complete, created_at, updated_at)
VALUES (
    1,
    1,
    CURRENT_DATE,
    'practice',
    'Pre-Season Practice #1',
    'Sunny',
    75,
    NULL,
    'University Field',
    '14:00:00',
    '16:30:00',
    150,
    'Batting practice, fielding drills, base running',
    'Great energy from the team, excellent hitting from Johnson and Williams',
    'Need to work on defensive positioning',
    'Continue with hitting drills tomorrow, focus on situational hitting',
    25,
    2,
    true,
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

-- Create a sample scouting report
INSERT INTO scouting_reports (player_id, created_by, report_date, game_date, opponent, overall_grade, overall_notes, hitting_grade, hitting_notes, pitching_grade, pitching_notes, fielding_grade, fielding_notes, speed_grade, speed_notes, intangibles_grade, intangibles_notes, projection, projection_notes, created_at, updated_at)
VALUES (
    1,
    1,
    CURRENT_DATE,
    CURRENT_DATE - INTERVAL '1 day',
    'Rival High School',
    'B+',
    'Strong overall player with good fundamentals',
    'A-',
    'Excellent bat speed, good plate discipline, power potential',
    NULL,
    NULL,
    'B',
    'Solid defensive skills, good range at shortstop',
    'B+',
    'Good speed, 4.2 home to first',
    'A',
    'Great work ethic, coachable, team leader',
    'College',
    'Has the tools to play at the D1 level',
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

-- Create sample preference list entries
INSERT INTO preference_lists (player_id, team_id, list_type, priority, added_by, added_date, notes, status, interest_level, created_at, updated_at)
VALUES 
    (1, 1, 'overall_pref_list', 1, 1, CURRENT_DATE, 'Top priority recruit - excellent all-around player', 'active', 'High', NOW(), NOW()),
    (3, 1, 'hs_pref_list', 2, 1, CURRENT_DATE, 'Great speed and hitting ability', 'active', 'High', NOW(), NOW()),
    (5, 1, 'hs_pref_list', 3, 1, CURRENT_DATE, 'Power hitter with good defensive skills', 'active', 'Medium', NOW(), NOW())
ON CONFLICT DO NOTHING; 
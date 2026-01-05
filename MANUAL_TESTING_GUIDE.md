# Manual Testing Guide - Sorting Functionality

## Overview
This guide provides comprehensive manual testing procedures for the sorting functionality added to four list endpoints:
- `/api/players`
- `/api/coaches`
- `/api/games`
- `/api/vendors`

## Prerequisites

### 1. Environment Setup
Create a `.env` file based on `env.example`:
```bash
cp env.example .env
```

### 2. Configure Required Variables
Edit `.env` and set at minimum:
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- Generate `JWT_SECRET`: `npm run generate:jwt-secret`

### 3. Install Dependencies
```bash
npm install
```

### 4. Setup Database
```bash
npm run db:migrate
npm run db:seed  # Optional: populate with test data
```

### 5. Start Server
```bash
npm run dev
```

Server should start on `http://localhost:5000`

---

## Authentication

All endpoints require authentication. First, obtain a JWT token:

```bash
# Login (adjust credentials based on your seed data)
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

Save the returned `token` value. Use it in all subsequent requests as:
```bash
-H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Test Scenarios

### 1. Players Endpoint (`/api/players`)

#### Supported Columns
- `first_name`
- `last_name`
- `position`
- `school_type`
- `graduation_year`
- `created_at`
- `status`

#### Test Cases

**1.1 Default Sorting (no parameters)**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/players
```
Expected: Results sorted by `created_at DESC`

**1.2 Sort by First Name (Ascending)**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/players?orderBy=first_name&sortDirection=ASC"
```
Expected: Players sorted alphabetically by first name A-Z

**1.3 Sort by First Name (Descending)**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/players?orderBy=first_name&sortDirection=DESC"
```
Expected: Players sorted reverse alphabetically by first name Z-A

**1.4 Sort by Graduation Year (Descending)**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/players?orderBy=graduation_year&sortDirection=DESC"
```
Expected: Players sorted by graduation year, most recent first

**1.5 Case-Insensitive Sort Direction**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/players?orderBy=last_name&sortDirection=asc"
```
Expected: Success - lowercase "asc" should work

**1.6 Invalid Column**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/players?orderBy=invalid_column&sortDirection=ASC"
```
Expected: 400 Bad Request with error message about invalid orderBy

**1.7 Invalid Sort Direction**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/players?orderBy=first_name&sortDirection=INVALID"
```
Expected: 400 Bad Request with error message about invalid sortDirection

**1.8 Sorting with Filters**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/players?status=active&orderBy=last_name&sortDirection=ASC"
```
Expected: Active players only, sorted by last name A-Z

**1.9 Sorting with Pagination**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/players?page=1&limit=10&orderBy=position&sortDirection=ASC"
```
Expected: First page of 10 players, sorted by position

**1.10 Only orderBy (no sortDirection)**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/players?orderBy=first_name"
```
Expected: Success - defaults to DESC

**1.11 Only sortDirection (no orderBy)**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/players?sortDirection=ASC"
```
Expected: Success - defaults to created_at ASC

---

### 2. Coaches Endpoint (`/api/coaches`)

#### Supported Columns
- `first_name`
- `last_name`
- `school_name`
- `position`
- `last_contact_date`
- `next_contact_date`
- `created_at`
- `status`

#### Test Cases

**2.1 Default Sorting**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/coaches
```
Expected: Results sorted by `created_at DESC`

**2.2 Sort by School Name**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/coaches?orderBy=school_name&sortDirection=ASC"
```
Expected: Coaches sorted alphabetically by school name

**2.3 Sort by Last Contact Date**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/coaches?orderBy=last_contact_date&sortDirection=DESC"
```
Expected: Coaches sorted by most recent contact first

**2.4 Sort by Next Contact Date**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/coaches?orderBy=next_contact_date&sortDirection=ASC"
```
Expected: Coaches sorted by upcoming contacts (soonest first)

**2.5 Invalid Column**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/coaches?orderBy=email&sortDirection=ASC"
```
Expected: 400 Bad Request - email is not a sortable column

**2.6 Sorting with Status Filter**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/coaches?status=active&orderBy=last_name&sortDirection=ASC"
```
Expected: Active coaches only, sorted by last name

---

### 3. Games Endpoint (`/api/games`)

#### Supported Columns
- `game_date`
- `opponent`
- `home_away`
- `result`
- `team_score`
- `opponent_score`
- `season`
- `created_at`

#### Test Cases

**3.1 Default Sorting**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/games
```
Expected: Results sorted by `game_date DESC` (most recent games first)

**3.2 Sort by Game Date (Ascending)**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/games?orderBy=game_date&sortDirection=ASC"
```
Expected: Games sorted chronologically (oldest first)

**3.3 Sort by Opponent**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/games?orderBy=opponent&sortDirection=ASC"
```
Expected: Games sorted alphabetically by opponent name

**3.4 Sort by Team Score (Descending)**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/games?orderBy=team_score&sortDirection=DESC"
```
Expected: Games sorted by highest team scores first

**3.5 Sort by Season**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/games?orderBy=season&sortDirection=DESC"
```
Expected: Games sorted by most recent season first

**3.6 Invalid Column**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/games?orderBy=location&sortDirection=ASC"
```
Expected: 400 Bad Request - location is not a sortable column

**3.7 Sorting with Season Filter**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/games?season=2024&orderBy=game_date&sortDirection=DESC"
```
Expected: 2024 season games only, sorted by date (most recent first)

---

### 4. Vendors Endpoint (`/api/vendors`)

#### Supported Columns
- `company_name`
- `contact_person`
- `vendor_type`
- `contract_value`
- `contract_start_date`
- `contract_end_date`
- `last_contact_date`
- `next_contact_date`
- `created_at`
- `status`

#### Test Cases

**4.1 Default Sorting**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/vendors
```
Expected: Results sorted by `created_at DESC`

**4.2 Sort by Company Name**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/vendors?orderBy=company_name&sortDirection=ASC"
```
Expected: Vendors sorted alphabetically by company name

**4.3 Sort by Contract Value (Descending)**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/vendors?orderBy=contract_value&sortDirection=DESC"
```
Expected: Vendors sorted by highest contract value first

**4.4 Sort by Contract End Date**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/vendors?orderBy=contract_end_date&sortDirection=ASC"
```
Expected: Vendors sorted by contracts ending soonest

**4.5 Sort by Vendor Type**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/vendors?orderBy=vendor_type&sortDirection=ASC"
```
Expected: Vendors sorted alphabetically by type

**4.6 Invalid Column**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/vendors?orderBy=address&sortDirection=ASC"
```
Expected: 400 Bad Request - address is not a sortable column

**4.7 Sorting with Vendor Type Filter**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/vendors?vendor_type=equipment&orderBy=company_name&sortDirection=ASC"
```
Expected: Equipment vendors only, sorted by company name

**4.8 Sorting with Status Filter**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/vendors?status=active&orderBy=contract_value&sortDirection=DESC"
```
Expected: Active vendors only, sorted by highest contract value

---

## Validation Checklist

For each endpoint tested, verify:

- [ ] **Default Behavior**: Without parameters, uses default sort (created_at DESC or game_date DESC)
- [ ] **Ascending Order**: sortDirection=ASC sorts in ascending order
- [ ] **Descending Order**: sortDirection=DESC sorts in descending order
- [ ] **Case Insensitivity**: "asc", "ASC", "Asc" all work for sortDirection
- [ ] **Valid Columns**: All documented columns can be sorted
- [ ] **Invalid Columns**: Returns 400 error with clear message
- [ ] **Invalid Directions**: Returns 400 error for invalid sortDirection values
- [ ] **Combination with Filters**: Sorting works alongside status/type/search filters
- [ ] **Combination with Pagination**: Sorting works with page/limit parameters
- [ ] **Partial Parameters**: Works with only orderBy (defaults sortDirection to DESC)
- [ ] **Partial Parameters**: Works with only sortDirection (defaults orderBy to created_at)
- [ ] **Response Structure**: Returns same structure as before (maintains backward compatibility)
- [ ] **Authentication**: Requires valid JWT token
- [ ] **Team Isolation**: Users only see data for their team

---

## Expected Error Response Format

Invalid requests should return HTTP 400 with format:
```json
{
  "errors": [
    {
      "msg": "orderBy must be one of: first_name, last_name, position, ...",
      "param": "orderBy",
      "location": "query"
    }
  ]
}
```

---

## Quick Test Script

Save this as `test-sorting.sh` for quick validation:

```bash
#!/bin/bash

# Set your token here after logging in
TOKEN="YOUR_TOKEN_HERE"
BASE_URL="http://localhost:5000/api"

echo "Testing Players Endpoint..."
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/players?orderBy=first_name&sortDirection=ASC" | jq '.data[0:3]'

echo -e "\nTesting Coaches Endpoint..."
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/coaches?orderBy=school_name&sortDirection=ASC" | jq '.data[0:3]'

echo -e "\nTesting Games Endpoint..."
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/games?orderBy=game_date&sortDirection=DESC" | jq '.data[0:3]'

echo -e "\nTesting Vendors Endpoint..."
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/vendors?orderBy=company_name&sortDirection=ASC" | jq '.data[0:3]'

echo -e "\nTesting Invalid Column (should fail)..."
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/players?orderBy=invalid&sortDirection=ASC" | jq '.'

echo -e "\nTesting Invalid Direction (should fail)..."
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/players?orderBy=first_name&sortDirection=INVALID" | jq '.'

echo -e "\nAll tests complete!"
```

Make executable: `chmod +x test-sorting.sh`

---

## Notes for Testing

1. **Seed Data**: Ensure you have sufficient test data in your database for meaningful sorting tests
2. **jq Tool**: Install `jq` for formatted JSON output: `brew install jq` (macOS) or `apt-get install jq` (Linux)
3. **Token Expiry**: JWT tokens expire after 7 days (default). Re-login if you get 401 errors
4. **Team Isolation**: Each user can only see data for their associated team
5. **Null Values**: Sorting on nullable columns (like last_contact_date) will place nulls at the end

---

## Automated Testing Alternative

If manual testing is impractical, the integration tests provide comprehensive coverage:

```bash
# Run sorting-specific tests
npm test -- --testNamePattern="sorting"

# Run all integration tests
npm test
```

Note: Integration tests require proper database configuration.

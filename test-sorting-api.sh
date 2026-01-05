#!/bin/bash

# Sorting Functionality Manual Test Script
# This script tests the sorting functionality across all four endpoints

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${API_BASE_URL:-http://localhost:5000}"
TOKEN="${API_TOKEN:-}"
LOGIN_EMAIL="${LOGIN_EMAIL:-test@example.com}"
LOGIN_PASSWORD="${LOGIN_PASSWORD:-password123}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Sorting Functionality Manual Test${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}Warning: 'jq' is not installed. Output will not be formatted.${NC}"
    echo -e "${YELLOW}Install it for better output: brew install jq (macOS) or apt-get install jq (Linux)${NC}\n"
    JQ_AVAILABLE=false
else
    JQ_AVAILABLE=true
fi

# Function to make API request and handle response
make_request() {
    local method=$1
    local endpoint=$2
    local description=$3
    local expect_success=$4

    echo -e "${BLUE}Testing:${NC} $description"

    local response
    local http_code

    if [ -z "$TOKEN" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" -X "$method" "$BASE_URL$endpoint")
    fi

    # Split response and status code
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    # Check if request succeeded
    if [ "$expect_success" = true ]; then
        if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
            echo -e "${GREEN}✓ Success${NC} (HTTP $http_code)"
            if [ "$JQ_AVAILABLE" = true ] && [ -n "$body" ]; then
                echo "$body" | jq -r '.data[0:2] | .[] | "  - \(.first_name // .company_name // .opponent // "Item") \(.last_name // "")"' 2>/dev/null || echo "  Response received"
            fi
        else
            echo -e "${RED}✗ Failed${NC} (HTTP $http_code)"
            if [ "$JQ_AVAILABLE" = true ] && [ -n "$body" ]; then
                echo "$body" | jq '.' 2>/dev/null || echo "$body"
            else
                echo "$body"
            fi
            return 1
        fi
    else
        if [ "$http_code" -ge 400 ] && [ "$http_code" -lt 500 ]; then
            echo -e "${GREEN}✓ Correctly rejected${NC} (HTTP $http_code)"
            if [ "$JQ_AVAILABLE" = true ] && [ -n "$body" ]; then
                echo "$body" | jq -r '.errors[0].msg // .message // .' 2>/dev/null | sed 's/^/  Error: /'
            fi
        else
            echo -e "${RED}✗ Unexpected response${NC} (HTTP $http_code, expected 400-499)"
            return 1
        fi
    fi

    echo ""
}

# Check server health
echo -e "${YELLOW}Step 1: Checking server health...${NC}"
if ! curl -s "${BASE_URL}/health" > /dev/null 2>&1; then
    echo -e "${RED}✗ Server is not responding at $BASE_URL${NC}"
    echo -e "${YELLOW}Please ensure the server is running:${NC}"
    echo "  cd backend && npm run dev"
    exit 1
fi
echo -e "${GREEN}✓ Server is running${NC}\n"

# Login if no token provided
if [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}Step 2: Authenticating...${NC}"
    echo "Using credentials: $LOGIN_EMAIL"

    login_response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$LOGIN_EMAIL\",\"password\":\"$LOGIN_PASSWORD\"}")

    http_code=$(echo "$login_response" | tail -n1)
    body=$(echo "$login_response" | sed '$d')

    if [ "$http_code" -eq 200 ]; then
        if [ "$JQ_AVAILABLE" = true ]; then
            TOKEN=$(echo "$body" | jq -r '.token')
        else
            # Fallback parsing without jq
            TOKEN=$(echo "$body" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
        fi

        if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
            echo -e "${RED}✗ Failed to extract token from login response${NC}"
            exit 1
        fi

        echo -e "${GREEN}✓ Authentication successful${NC}\n"
    else
        echo -e "${RED}✗ Login failed (HTTP $http_code)${NC}"
        echo -e "${YELLOW}Please check your credentials or seed the database:${NC}"
        echo "  cd backend && npm run db:seed"
        exit 1
    fi
else
    echo -e "${YELLOW}Step 2: Using provided token${NC}\n"
fi

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0

run_test() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    if make_request "$@"; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
    fi
}

# Players Endpoint Tests
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Testing Players Endpoint${NC}"
echo -e "${BLUE}========================================${NC}\n"

run_test GET "/api/players" "Default sorting (no parameters)" true
run_test GET "/api/players?orderBy=first_name&sortDirection=ASC" "Sort by first_name ASC" true
run_test GET "/api/players?orderBy=first_name&sortDirection=DESC" "Sort by first_name DESC" true
run_test GET "/api/players?orderBy=last_name&sortDirection=asc" "Case-insensitive sortDirection" true
run_test GET "/api/players?orderBy=graduation_year&sortDirection=DESC" "Sort by graduation_year DESC" true
run_test GET "/api/players?orderBy=invalid_column&sortDirection=ASC" "Invalid column (should fail)" false
run_test GET "/api/players?orderBy=first_name&sortDirection=INVALID" "Invalid direction (should fail)" false

# Coaches Endpoint Tests
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Testing Coaches Endpoint${NC}"
echo -e "${BLUE}========================================${NC}\n"

run_test GET "/api/coaches" "Default sorting (no parameters)" true
run_test GET "/api/coaches?orderBy=school_name&sortDirection=ASC" "Sort by school_name ASC" true
run_test GET "/api/coaches?orderBy=last_contact_date&sortDirection=DESC" "Sort by last_contact_date DESC" true
run_test GET "/api/coaches?orderBy=email&sortDirection=ASC" "Invalid column (should fail)" false
run_test GET "/api/coaches?orderBy=first_name&sortDirection=WRONG" "Invalid direction (should fail)" false

# Games Endpoint Tests
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Testing Games Endpoint${NC}"
echo -e "${BLUE}========================================${NC}\n"

run_test GET "/api/games" "Default sorting (no parameters)" true
run_test GET "/api/games?orderBy=game_date&sortDirection=ASC" "Sort by game_date ASC" true
run_test GET "/api/games?orderBy=opponent&sortDirection=ASC" "Sort by opponent ASC" true
run_test GET "/api/games?orderBy=team_score&sortDirection=DESC" "Sort by team_score DESC" true
run_test GET "/api/games?orderBy=location&sortDirection=ASC" "Invalid column (should fail)" false
run_test GET "/api/games?orderBy=game_date&sortDirection=UP" "Invalid direction (should fail)" false

# Vendors Endpoint Tests
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Testing Vendors Endpoint${NC}"
echo -e "${BLUE}========================================${NC}\n"

run_test GET "/api/vendors" "Default sorting (no parameters)" true
run_test GET "/api/vendors?orderBy=company_name&sortDirection=ASC" "Sort by company_name ASC" true
run_test GET "/api/vendors?orderBy=contract_value&sortDirection=DESC" "Sort by contract_value DESC" true
run_test GET "/api/vendors?orderBy=contract_end_date&sortDirection=ASC" "Sort by contract_end_date ASC" true
run_test GET "/api/vendors?orderBy=address&sortDirection=ASC" "Invalid column (should fail)" false
run_test GET "/api/vendors?orderBy=company_name&sortDirection=BAD" "Invalid direction (should fail)" false

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}========================================${NC}\n"

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo -e "${GREEN}✓ All tests passed: $PASSED_TESTS/$TOTAL_TESTS${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠ Some tests failed: $PASSED_TESTS/$TOTAL_TESTS passed${NC}"
    exit 1
fi

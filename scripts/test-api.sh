#!/bin/bash
#
# API Testing Script for Sports2 Backend
# Usage: ./scripts/test-api.sh [command]
#
# Commands:
#   login     - Authenticate and save session
#   players   - Test players endpoints
#   teams     - Test teams endpoints
#   games     - Test games endpoints
#   all       - Run all tests
#   <none>    - Interactive mode with saved session
#

set -e

BASE_URL="http://localhost:5000"
COOKIE_FILE="/tmp/sports2-cookies.txt"
CSRF_TOKEN=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}→ $1${NC}"
}

# Get fresh CSRF token
get_csrf_token() {
    CSRF_TOKEN=$(curl -s -c "$COOKIE_FILE" -b "$COOKIE_FILE" "$BASE_URL/api/v1/auth/csrf-token" | jq -r '.token')
    if [ "$CSRF_TOKEN" = "null" ] || [ -z "$CSRF_TOKEN" ]; then
        print_error "Failed to get CSRF token"
        return 1
    fi
}

# Check if server is running
check_server() {
    if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
        print_error "Server is not running at $BASE_URL"
        echo "Start the server with: npm run dev"
        exit 1
    fi
    print_success "Server is running"
}

# Login and save session
do_login() {
    print_header "Authenticating"

    get_csrf_token

    local response=$(curl -s -c "$COOKIE_FILE" -b "$COOKIE_FILE" \
        -X POST "$BASE_URL/api/v1/auth/login" \
        -H "Content-Type: application/json" \
        -H "X-CSRF-Token: $CSRF_TOKEN" \
        -d '{"email": "user@example.com", "password": "password"}')

    local success=$(echo "$response" | jq -r '.success')

    if [ "$success" = "true" ]; then
        local user=$(echo "$response" | jq -r '.data.email')
        local team=$(echo "$response" | jq -r '.data.team.name')
        print_success "Logged in as: $user"
        print_success "Team: $team"
        echo "$response" | jq '.data | {id, email, role, team: .team.name}'
    else
        print_error "Login failed"
        echo "$response" | jq '.'
        exit 1
    fi
}

# GET request helper
api_get() {
    curl -s -b "$COOKIE_FILE" "$BASE_URL$1"
}

# POST request helper
api_post() {
    get_csrf_token
    curl -s -c "$COOKIE_FILE" -b "$COOKIE_FILE" \
        -X POST "$BASE_URL$1" \
        -H "Content-Type: application/json" \
        -H "X-CSRF-Token: $CSRF_TOKEN" \
        -d "$2"
}

# PUT request helper
api_put() {
    get_csrf_token
    curl -s -c "$COOKIE_FILE" -b "$COOKIE_FILE" \
        -X PUT "$BASE_URL$1" \
        -H "Content-Type: application/json" \
        -H "X-CSRF-Token: $CSRF_TOKEN" \
        -d "$2"
}

# DELETE request helper
api_delete() {
    get_csrf_token
    curl -s -c "$COOKIE_FILE" -b "$COOKIE_FILE" \
        -X DELETE "$BASE_URL$1" \
        -H "X-CSRF-Token: $CSRF_TOKEN"
}

# Test players endpoints
test_players() {
    print_header "Testing Players API"

    # GET all players
    print_info "GET /api/v1/players"
    local count=$(api_get "/api/v1/players" | jq '.data | length')
    print_success "Found $count players"

    # GET single player
    print_info "GET /api/v1/players/byId/1"
    api_get "/api/v1/players/byId/1" | jq '{success, player: .data | {id, first_name, last_name, position}}'

    # POST create player
    print_info "POST /api/v1/players (create)"
    local created=$(api_post "/api/v1/players" '{
        "first_name": "Script",
        "last_name": "Test",
        "position": "CF",
        "jersey_number": 77,
        "year": "Junior",
        "school_type": "COLL"
    }')
    local new_id=$(echo "$created" | jq -r '.data.id')

    if [ "$new_id" != "null" ]; then
        print_success "Created player with id=$new_id"

        # PUT update player
        print_info "PUT /api/v1/players/byId/$new_id (update)"
        api_put "/api/v1/players/byId/$new_id" '{"first_name": "Updated", "jersey_number": 88}' | jq '{success}'
        print_success "Updated player"

        # DELETE player
        print_info "DELETE /api/v1/players/byId/$new_id"
        api_delete "/api/v1/players/byId/$new_id" | jq '{success, message}'
        print_success "Deleted player"
    else
        print_error "Failed to create player"
        echo "$created" | jq '.'
    fi
}

# Test teams endpoints
test_teams() {
    print_header "Testing Teams API"

    print_info "GET /api/v1/teams"
    api_get "/api/v1/teams" | jq '.data[:3] | .[] | {id, name, conference}'

    local count=$(api_get "/api/v1/teams" | jq '.data | length')
    print_success "Found $count teams"
}

# Test games endpoints
test_games() {
    print_header "Testing Games API"

    print_info "GET /api/v1/games"
    api_get "/api/v1/games" | jq '.data[:3] | .[] | {id, opponent, game_date, home_away}'

    local count=$(api_get "/api/v1/games" | jq '.data | length')
    print_success "Found $count games"
}

# Test schedules endpoints
test_schedules() {
    print_header "Testing Schedules API"

    print_info "GET /api/v1/schedules"
    api_get "/api/v1/schedules" | jq '.data[:2]'

    local count=$(api_get "/api/v1/schedules" | jq '.data | length')
    print_success "Found $count schedules"
}

# Test depth charts endpoints
test_depth_charts() {
    print_header "Testing Depth Charts API"

    print_info "GET /api/v1/depth-charts"
    api_get "/api/v1/depth-charts" | jq '.data | .[] | {id, name, is_active}'

    local count=$(api_get "/api/v1/depth-charts" | jq '.data | length')
    print_success "Found $count depth charts"
}

# Test reports endpoints
test_reports() {
    print_header "Testing Reports API"

    print_info "GET /api/v1/reports"
    api_get "/api/v1/reports" | jq '.data[:2] | .[] | {id, title}'

    local count=$(api_get "/api/v1/reports" | jq '.data | length')
    print_success "Found $count reports"
}

# Test locations endpoints
test_locations() {
    print_header "Testing Locations API"

    # POST create location
    print_info "POST /api/v1/locations (create)"
    local created=$(api_post "/api/v1/locations" '{
        "name": "Test Field",
        "address": "123 Test St",
        "city": "Austin",
        "state": "TX",
        "zip_code": "78701"
    }')
    local new_id=$(echo "$created" | jq -r '.data.id')

    if [ "$new_id" != "null" ]; then
        print_success "Created location with id=$new_id"

        # GET all locations
        print_info "GET /api/v1/locations"
        api_get "/api/v1/locations" | jq '.data | .[] | {id, name, city}'

        # DELETE location
        print_info "DELETE /api/v1/locations/$new_id"
        api_delete "/api/v1/locations/$new_id" | jq '{success}'
        print_success "Deleted location"
    else
        print_error "Failed to create location"
    fi
}

# Test auth endpoints
test_auth() {
    print_header "Testing Auth API"

    print_info "GET /api/v1/auth/me"
    api_get "/api/v1/auth/me" | jq '.data | {id, email, role, team: .Team.name}'

    print_info "GET /api/v1/auth/permissions"
    local perms=$(api_get "/api/v1/auth/permissions" | jq '.data | length')
    print_success "User has $perms permissions"
}

# Run all tests
run_all_tests() {
    check_server
    do_login
    test_auth
    test_players
    test_teams
    test_games
    test_schedules
    test_depth_charts
    test_reports
    test_locations

    print_header "All Tests Complete!"
}

# Main
case "${1:-}" in
    login)
        check_server
        do_login
        ;;
    players)
        check_server
        do_login
        test_players
        ;;
    teams)
        check_server
        do_login
        test_teams
        ;;
    games)
        check_server
        do_login
        test_games
        ;;
    schedules)
        check_server
        do_login
        test_schedules
        ;;
    depth-charts)
        check_server
        do_login
        test_depth_charts
        ;;
    reports)
        check_server
        do_login
        test_reports
        ;;
    locations)
        check_server
        do_login
        test_locations
        ;;
    auth)
        check_server
        do_login
        test_auth
        ;;
    all)
        run_all_tests
        ;;
    *)
        echo "Sports2 Backend API Test Script"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  login        - Authenticate and save session"
        echo "  auth         - Test auth endpoints"
        echo "  players      - Test players endpoints"
        echo "  teams        - Test teams endpoints"
        echo "  games        - Test games endpoints"
        echo "  schedules    - Test schedules endpoints"
        echo "  depth-charts - Test depth charts endpoints"
        echo "  reports      - Test reports endpoints"
        echo "  locations    - Test locations endpoints"
        echo "  all          - Run all tests"
        echo ""
        echo "Examples:"
        echo "  $0 all              # Run all API tests"
        echo "  $0 players          # Test only players API"
        echo "  $0 login            # Just authenticate"
        ;;
esac

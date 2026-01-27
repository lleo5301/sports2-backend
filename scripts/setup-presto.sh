#!/bin/bash
#
# PrestoSports Integration Setup Script
# This script securely configures PrestoSports credentials
#

set -e

BASE_URL="${API_URL:-http://localhost:5000}"
COOKIE_FILE="/tmp/presto-setup-cookies.txt"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "═══════════════════════════════════════════════════════════════"
echo "  PrestoSports Integration Setup"
echo "═══════════════════════════════════════════════════════════════"
echo -e "${NC}"

# Check if server is running
if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
    echo -e "${RED}Error: Server is not running at $BASE_URL${NC}"
    echo "Start the server with: docker compose up -d"
    exit 1
fi

echo -e "${GREEN}✓ Server is running${NC}"
echo ""

# Get credentials from user (hidden input)
echo -e "${YELLOW}Enter your PrestoSports credentials:${NC}"
echo -n "Username: "
read PRESTO_USER

echo -n "Password: "
read -s PRESTO_PASS
echo ""

if [ -z "$PRESTO_USER" ] || [ -z "$PRESTO_PASS" ]; then
    echo -e "${RED}Error: Username and password are required${NC}"
    exit 1
fi

# Login as admin first
echo ""
echo -e "${BLUE}Authenticating with Sports2...${NC}"

CSRF=$(curl -s -c "$COOKIE_FILE" "$BASE_URL/api/v1/auth/csrf-token" | jq -r '.token')

LOGIN_RESULT=$(curl -s -c "$COOKIE_FILE" -b "$COOKIE_FILE" \
    -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $CSRF" \
    -d '{"email": "admin@sports2.com", "password": "Admin123!"}')

if [ "$(echo "$LOGIN_RESULT" | jq -r '.success')" != "true" ]; then
    echo -e "${RED}Error: Failed to authenticate with Sports2${NC}"
    echo "$LOGIN_RESULT" | jq '.'
    exit 1
fi

echo -e "${GREEN}✓ Authenticated as admin${NC}"

# Test PrestoSports credentials
echo ""
echo -e "${BLUE}Testing PrestoSports connection...${NC}"

CSRF=$(curl -s -c "$COOKIE_FILE" -b "$COOKIE_FILE" "$BASE_URL/api/v1/auth/csrf-token" | jq -r '.token')

# Create JSON payload securely
PAYLOAD=$(jq -n --arg u "$PRESTO_USER" --arg p "$PRESTO_PASS" '{username: $u, password: $p}')

TEST_RESULT=$(curl -s -c "$COOKIE_FILE" -b "$COOKIE_FILE" \
    -X POST "$BASE_URL/api/v1/integrations/presto/test" \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $CSRF" \
    -d "$PAYLOAD")

if [ "$(echo "$TEST_RESULT" | jq -r '.success')" != "true" ]; then
    echo -e "${RED}Error: PrestoSports connection failed${NC}"
    echo "$TEST_RESULT" | jq '.'
    exit 1
fi

echo -e "${GREEN}✓ PrestoSports credentials are valid${NC}"
echo ""
echo "User info:"
echo "$TEST_RESULT" | jq '.data.userInfo'

# Ask to save credentials
echo ""
echo -e "${YELLOW}Do you want to save these credentials? (y/n)${NC}"
read -n 1 SAVE_CREDS
echo ""

if [ "$SAVE_CREDS" != "y" ] && [ "$SAVE_CREDS" != "Y" ]; then
    echo "Credentials not saved."
    rm -f "$COOKIE_FILE"
    exit 0
fi

# Save credentials
echo ""
echo -e "${BLUE}Saving PrestoSports credentials...${NC}"

CSRF=$(curl -s -c "$COOKIE_FILE" -b "$COOKIE_FILE" "$BASE_URL/api/v1/auth/csrf-token" | jq -r '.token')

SAVE_RESULT=$(curl -s -c "$COOKIE_FILE" -b "$COOKIE_FILE" \
    -X POST "$BASE_URL/api/v1/integrations/presto/configure" \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $CSRF" \
    -d "$PAYLOAD")

if [ "$(echo "$SAVE_RESULT" | jq -r '.success')" != "true" ]; then
    echo -e "${RED}Error: Failed to save credentials${NC}"
    echo "$SAVE_RESULT" | jq '.'
    rm -f "$COOKIE_FILE"
    exit 1
fi

echo -e "${GREEN}✓ Credentials saved successfully${NC}"

# Get available teams
echo ""
echo -e "${BLUE}Fetching available teams...${NC}"

TEAMS_RESULT=$(curl -s -b "$COOKIE_FILE" "$BASE_URL/api/v1/integrations/presto/teams")

if [ "$(echo "$TEAMS_RESULT" | jq -r '.success')" == "true" ]; then
    TEAMS=$(echo "$TEAMS_RESULT" | jq -r '.data')
    TEAM_COUNT=$(echo "$TEAMS" | jq 'length')

    if [ "$TEAM_COUNT" -gt 0 ]; then
        echo -e "${GREEN}Found $TEAM_COUNT teams:${NC}"
        # Filter for baseball teams and show first 10
        BASEBALL_TEAMS=$(echo "$TEAMS" | jq '[.[] | select(.season.sport.sportName | ascii_downcase | contains("baseball"))] | sort_by(.season.seasonName) | reverse')
        BASEBALL_COUNT=$(echo "$BASEBALL_TEAMS" | jq 'length')

        if [ "$BASEBALL_COUNT" -gt 0 ]; then
            echo ""
            echo -e "${BLUE}Baseball teams (showing up to 10):${NC}"
            echo "$BASEBALL_TEAMS" | jq -r '.[0:10] | .[] | "  - \(.teamName) | Season: \(.season.seasonName) | ID: \(.teamId)"'

            if [ "$BASEBALL_COUNT" -gt 10 ]; then
                echo -e "  ${YELLOW}... and $((BASEBALL_COUNT - 10)) more baseball teams${NC}"
            fi
        else
            echo -e "${YELLOW}No baseball teams found. Showing first 10 teams:${NC}"
            echo "$TEAMS" | jq -r '.[0:10] | .[] | "  - \(.teamName) | Season: \(.season.seasonName) | ID: \(.teamId)"'
        fi

        echo ""
        echo -e "${BLUE}Total teams accessible: $TEAM_COUNT${NC}"
    else
        echo -e "${YELLOW}No teams found. You may need to select a season first.${NC}"
    fi
fi

# Cleanup
rm -f "$COOKIE_FILE"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  PrestoSports integration configured successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo "  1. Select your team and season in the app settings"
echo "  2. Run a sync to import your roster, schedule, and stats"
echo ""
echo "API endpoints for syncing:"
echo "  POST /api/v1/integrations/presto/sync/roster   - Sync players"
echo "  POST /api/v1/integrations/presto/sync/schedule - Sync games"
echo "  POST /api/v1/integrations/presto/sync/stats    - Sync statistics"
echo "  POST /api/v1/integrations/presto/sync/all      - Sync everything"
echo ""

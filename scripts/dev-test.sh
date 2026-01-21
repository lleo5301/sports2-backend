#!/bin/bash

# Development Testing Script for Sports2 Backend
# Bootstraps Docker containers, sets up database, and runs tests with hot reloading

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
BACKEND_PORT="${BACKEND_PORT:-5000}"
DB_PORT="${DB_PORT:-5432}"
USE_DOCKER_BACKEND="${USE_DOCKER_BACKEND:-false}"

# Functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

check_docker() {
    # Check for docker-compose first (more reliable)
    if command -v docker-compose &> /dev/null; then
        if docker-compose ps &> /dev/null; then
            log_success "Docker Compose is available"
            return 0
        fi
    fi
    
    # Fallback to docker command
    if command -v docker &> /dev/null; then
        if docker info &> /dev/null; then
            log_success "Docker is available"
            return 0
        fi
    fi
    
    log_error "Docker/Docker Compose is not available or daemon is not running"
    exit 1
}

check_port() {
    local port=$1
    local service=$2
    
    if lsof -ti:$port &> /dev/null; then
        local pid=$(lsof -ti:$port | head -1)
        local process=$(ps -p $pid -o comm= 2>/dev/null || echo "unknown")
        log_warning "Port $port is already in use by $process (PID: $pid)"
        return 1
    fi
    return 0
}

find_available_port() {
    local start_port=$1
    local max_port=$((start_port + 10))
    local port=$start_port
    
    while [ $port -le $max_port ]; do
        if lsof -ti:$port &> /dev/null; then
            port=$((port + 1))
            continue
        fi
        echo $port
        return 0
    done
    
    log_error "No available port found in range $start_port-$max_port"
    return 1
}

wait_for_db() {
    log_info "Waiting for database to be ready..."
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker-compose exec -T postgres pg_isready -U postgres -d sports2 &> /dev/null; then
            log_success "Database is ready"
            return 0
        fi
        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done
    
    log_error "Database failed to become ready after $max_attempts seconds"
    return 1
}

start_postgres() {
    log_info "Starting PostgreSQL container..."
    
    # Check if container is running using docker-compose
    if docker-compose ps postgres 2>/dev/null | grep -q "Up"; then
        log_success "PostgreSQL container is already running"
        return 0
    fi
    
    if ! check_port $DB_PORT "PostgreSQL"; then
        log_warning "Port $DB_PORT is in use. Attempting to start container anyway..."
    fi
    
    cd "$PROJECT_DIR"
    docker-compose up -d postgres
    
    if wait_for_db; then
        log_success "PostgreSQL container started successfully"
        return 0
    else
        log_error "Failed to start PostgreSQL container"
        return 1
    fi
}

run_migrations() {
    log_info "Running database migrations..."
    
    if [ "$USE_DOCKER_BACKEND" = "true" ]; then
        docker-compose exec -T backend npm run db:migrate || {
            log_warning "Migration failed in container, trying locally..."
            cd "$PROJECT_DIR"
            export DB_HOST=localhost
            export DB_PORT=5432
            export DB_NAME=sports2
            export DB_USER=postgres
            export DB_PASSWORD=postgres123
            npm run db:migrate
        }
    else
        cd "$PROJECT_DIR"
        export DB_HOST=localhost
        export DB_PORT=5432
        export DB_NAME=sports2
        export DB_USER=postgres
        export DB_PASSWORD=postgres123
        npm run db:migrate
    fi
    
    log_success "Database migrations completed"
}

seed_database() {
    local seed=${1:-false}
    
    if [ "$seed" != "true" ]; then
        return 0
    fi
    
    log_info "Seeding database..."
    
    if [ "$USE_DOCKER_BACKEND" = "true" ]; then
        docker-compose exec -T backend npm run db:seed || {
            log_warning "Seeding failed in container, trying locally..."
            cd "$PROJECT_DIR"
            export DB_HOST=localhost
            export DB_PORT=5432
            export DB_NAME=sports2
            export DB_USER=postgres
            export DB_PASSWORD=postgres123
            npm run db:seed
        }
    else
        cd "$PROJECT_DIR"
        export DB_HOST=localhost
        export DB_PORT=5432
        export DB_NAME=sports2
        export DB_USER=postgres
        export DB_PASSWORD=postgres123
        npm run db:seed
    fi
    
    log_success "Database seeding completed"
}

start_backend_docker() {
    log_info "Starting backend in Docker container (with hot reload)..."
    
    if ! check_port $BACKEND_PORT "Backend" 2>/dev/null; then
        log_warning "Port $BACKEND_PORT is in use, finding alternative..."
        local found_port=$(find_available_port $BACKEND_PORT)
        if [ $? -eq 0 ] && [ -n "$found_port" ]; then
            log_info "Using port $found_port instead of $BACKEND_PORT"
            BACKEND_PORT=$found_port
        else
            log_error "Cannot start backend: no available port found"
            return 1
        fi
    fi
    
    cd "$PROJECT_DIR"
    docker-compose up -d backend
    
    log_info "Waiting for backend to be ready..."
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:$BACKEND_PORT/health &> /dev/null; then
            log_success "Backend is ready at http://localhost:$BACKEND_PORT"
            return 0
        fi
        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done
    
    log_error "Backend failed to become ready after $max_attempts seconds"
    docker-compose logs backend | tail -20
    return 1
}

start_backend_local() {
    log_info "Starting backend locally with hot reload (nodemon)..."
    
    if ! check_port $BACKEND_PORT "Backend" 2>/dev/null; then
        log_warning "Port $BACKEND_PORT is in use, finding alternative..."
        local found_port=$(find_available_port $BACKEND_PORT)
        if [ $? -eq 0 ] && [ -n "$found_port" ]; then
            log_info "Using port $found_port instead of $BACKEND_PORT"
            BACKEND_PORT=$found_port
        else
            log_error "Cannot start backend: no available port found"
            return 1
        fi
    fi
    
    cd "$PROJECT_DIR"
    
    # Set environment variables
    export NODE_ENV=development
    export PORT=$BACKEND_PORT
    export DB_HOST=localhost
    export DB_PORT=5432
    export DB_NAME=sports2
    export DB_USER=postgres
    export DB_PASSWORD=postgres123
    export JWT_SECRET="${JWT_SECRET:-dev_jwt_secret_change_in_production}"
    export JWT_EXPIRES_IN=7d
    export CORS_ORIGIN=http://localhost:3000,http://localhost:4000,http://localhost
    export FRONTEND_URL=http://localhost:3000
    export APP_URL=http://localhost:3000
    export LANDING_URL=http://localhost:4000
    export RATE_LIMIT_WINDOW_MS=900000
    export RATE_LIMIT_MAX_REQUESTS=100
    export MAX_FILE_SIZE=5242880
    export UPLOAD_PATH=./uploads
    export LOG_LEVEL=debug
    export DEFAULT_TEAM_ID=1
    
    # Start with nodemon for hot reloading
    log_info "Backend starting with hot reload at http://localhost:$BACKEND_PORT"
    log_info "Note: E2E tests should use API_URL=http://localhost:$BACKEND_PORT"
    log_info "Press Ctrl+C to stop"
    npm run dev
}

run_tests() {
    local test_type=${1:-all}
    
    log_info "Running tests: $test_type"
    
    cd "$PROJECT_DIR"
    
    # Set test environment variables
    export NODE_ENV=test
    export DB_HOST=localhost
    export DB_PORT=5432
    export DB_NAME=sports2_test
    export DB_USER=postgres
    export DB_PASSWORD=postgres123
    export JWT_SECRET=test_jwt_secret_for_ci
    
    case $test_type in
        unit)
            log_info "Running unit tests..."
            npm test
            ;;
        e2e|api)
            log_info "Running E2E/API tests..."
            export API_URL="http://localhost:$BACKEND_PORT"
            npm run test:api
            ;;
        all)
            log_info "Running all tests in parallel..."
            export API_URL="http://localhost:$BACKEND_PORT"
            (npm test 2>&1 | tee /tmp/jest-results.log &)
            JEST_PID=$!
            (npm run test:api 2>&1 | tee /tmp/mocha-results.log &)
            MOCHA_PID=$!
            wait $JEST_PID $MOCHA_PID
            echo ""
            echo "=== UNIT TESTS (JEST) SUMMARY ==="
            tail -30 /tmp/jest-results.log
            echo ""
            echo "=== E2E TESTS (MOCHA) SUMMARY ==="
            tail -30 /tmp/mocha-results.log
            ;;
        *)
            log_error "Unknown test type: $test_type"
            return 1
            ;;
    esac
}

cleanup() {
    log_info "Cleaning up..."
    cd "$PROJECT_DIR"
    docker-compose down
    log_success "Cleanup completed"
}

show_help() {
    cat << EOF
Development Testing Script for Sports2 Backend

Usage: $0 [COMMAND] [OPTIONS]

Commands:
    setup           Start PostgreSQL and run migrations (default)
    start           Start backend server (local with hot reload)
    start:docker    Start backend server in Docker container
    test            Run tests (unit, e2e, or all)
    cleanup         Stop and remove all containers
    status          Show status of containers and services
    help            Show this help message

Options:
    --port PORT         Backend port (default: 5000)
    --db-port PORT      Database port (default: 5432)
    --seed              Seed database after migrations
    --docker-backend    Use Docker for backend (default: local with nodemon)
    --test-type TYPE    Test type: unit, e2e, or all (default: all)

Environment Variables:
    BACKEND_PORT        Backend port (default: 5000)
    DB_PORT             Database port (default: 5432)
    USE_DOCKER_BACKEND  Use Docker for backend (default: false)
    JWT_SECRET          JWT secret (default: dev secret)

Examples:
    # Full setup and start with hot reload
    $0 setup && $0 start

    # Run all tests
    $0 test --test-type all

    # Start in Docker and run E2E tests
    $0 setup --seed && $0 start:docker && $0 test --test-type e2e

    # Cleanup everything
    $0 cleanup
EOF
}

show_status() {
    log_info "Container Status:"
    cd "$PROJECT_DIR"
    docker-compose ps
    
    echo ""
    log_info "Port Status:"
    if check_port $BACKEND_PORT "Backend"; then
        log_success "Port $BACKEND_PORT is available"
    fi
    
    if check_port $DB_PORT "PostgreSQL"; then
        log_success "Port $DB_PORT is available"
    fi
    
    echo ""
    log_info "Service Health:"
    if curl -s http://localhost:$BACKEND_PORT/health &> /dev/null; then
        log_success "Backend is responding"
        curl -s http://localhost:$BACKEND_PORT/health | jq . 2>/dev/null || curl -s http://localhost:$BACKEND_PORT/health
    else
        log_warning "Backend is not responding"
    fi
}

# Main script logic
main() {
    local command=${1:-setup}
    shift || true
    
    local seed=false
    local test_type=all
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --port)
                BACKEND_PORT="$2"
                shift 2
                ;;
            --db-port)
                DB_PORT="$2"
                shift 2
                ;;
            --seed)
                seed=true
                shift
                ;;
            --docker-backend)
                USE_DOCKER_BACKEND=true
                shift
                ;;
            --test-type)
                test_type="$2"
                shift 2
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    cd "$PROJECT_DIR"
    
    case $command in
        setup)
            check_docker
            start_postgres
            run_migrations
            seed_database $seed
            log_success "Setup completed!"
            ;;
        start)
            check_docker
            start_postgres
            start_backend_local
            ;;
        start:docker)
            check_docker
            start_postgres
            run_migrations
            start_backend_docker
            log_info "Backend logs: docker-compose logs -f backend"
            ;;
        test)
            run_tests $test_type
            ;;
        cleanup)
            cleanup
            ;;
        status)
            show_status
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"

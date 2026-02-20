FROM node:24-slim

# Install CA certificates (for httpcloak's Go TLS) and build tools for native binaries
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates cmake make g++ python3 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --only=production --no-audit --no-fund

# Copy source code
COPY . .

# Create uploads directory and ensure proper permissions
RUN mkdir -p uploads uploads/videos && \
    chmod 755 uploads uploads/videos

# Create non-root user
RUN groupadd -g 1001 nodejs
RUN useradd -u 1001 -g nodejs -s /bin/sh nodejs

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app && \
    chown -R nodejs:nodejs /app/uploads
USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"] 
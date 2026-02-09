# Use official Playwright image (Includes Node.js & Browsers)
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and lock files
COPY package*.json ./

# Install dependencies
# unsafe-perm is good for root user in Docker
RUN npm ci --unsafe-perm

# Ensure browsers are installed for the specific Playwright version
RUN npx playwright install --with-deps

# Copy source code
COPY . .

# Build TypeScript to dist/
RUN npm run build

# Expose port for Cloud Run (Default 8080)
ENV PORT=8080
EXPOSE 8080

# Environment variables
ENV CRAWLEE_AVAILABLE_MEMORY_RATIO=0.8
ENV APIFY_DISABLE_OUTDATED_WARNING=1

# Start the server (Cloud Run entrypoint)
CMD ["npm", "run", "start:cloudrun"]

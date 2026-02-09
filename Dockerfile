# Use Node.js 20 slim image
FROM node:20

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy patches directory to ensure patch-package can find them during postinstall
COPY patches ./patches

# Install dependencies (including devDependencies for build tools like Vite and TSX)
RUN npm install

# Copy source code
COPY . .

# [FIX] VITE requires build-time environment variables
ARG VITE_STRIPE_PUBLISHABLE_KEY
ENV VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY

# Build frontend static files
RUN npm run build:server
RUN npm run build

# Expose port (Cloud Run expects 8080 by default)
EXPOSE 8080

# Start server using tsx
# Start server using npm start (runs compiled node code)
CMD ["npm", "start"]

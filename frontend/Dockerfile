# Frontend Dockerfile - Running Vite in container
FROM node:20-alpine

# Install basic utilities
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application (optional, for preview mode)
RUN npm run build

# Expose port
EXPOSE 5173

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5173 || exit 1

# Start vite preview server (serves built files with vite)
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]

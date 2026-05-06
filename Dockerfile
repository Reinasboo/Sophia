FROM node:24-bullseye

# Create app directory
WORKDIR /app

# Install dependencies (production only)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Production env
ENV NODE_ENV=production

# Expose server port (uses PORT env at runtime)
EXPOSE 3001

# Start the compiled server
CMD ["npm", "run", "start:server"]

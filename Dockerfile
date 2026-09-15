FROM node:20-slim AS backend
WORKDIR /app

# Copy backend package files and install deps
COPY api-server/package*.json ./api-server/
RUN cd api-server && npm ci

# Copy backend source
COPY api-server ./api-server

# Install Python and ML dependencies (needed for model inference)
RUN apt-get update && apt-get install -y python3 python3-pip python3-dev build-essential libopenblas-dev && \
    pip3 install --no-cache-dir --break-system-packages joblib scikit-learn pandas numpy && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# ----------- Frontend build stage -----------
FROM node:20-alpine AS frontend
WORKDIR /app

# Copy frontend package files and install deps
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

# Copy frontend source and build
COPY frontend ./frontend
RUN cd frontend && npm run build

# ----------- Final runtime image -----------
FROM backend AS runtime
WORKDIR /app

# Copy the full inference pipeline, not merely the serialized model.
COPY ml-service ./ml-service

# Copy built frontend assets
COPY --from=frontend /app/frontend/dist ./frontend/dist

# Install a static file server for the frontend
RUN npm install -g serve

# Expose API and frontend ports
EXPOSE 5000 3000

# Default environment variables
ENV PORT=5000

# Run both the frontend static server and the API server
CMD ["sh", "-c", "serve -s frontend/dist -l 3000 & cd api-server && npm start"]

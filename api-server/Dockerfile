FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install && \
    apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && \
    pip3 install --no-cache-dir --break-system-packages joblib scikit-learn pandas numpy && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
COPY . .
EXPOSE 5000
CMD ["npm", "start"]

FROM node:20-alpine
# Install git and docker CLI if needed for cloning and docker socket commands
RUN apk add --no-cache git docker-cli
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
COPY sample-app ./sample-app
EXPOSE 5001
CMD ["npm", "start"]

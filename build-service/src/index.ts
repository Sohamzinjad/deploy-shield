import express, { Request, Response } from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';

const execAsync = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 5001;
const API_SERVER_URL = process.env.API_SERVER_URL || 'http://api-server:5000';
const DOCKER_NETWORK = process.env.DOCKER_NETWORK || 'deployshield-net';

app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
  res.json({ service: 'build-service', status: 'ok' });
});

export interface BuildRequest {
  repoUrl: string;
  appId: string;
  name?: string;
}

// POST /build - Clone git repo, build Docker image, run container & register with api-server
app.post('/build', async (req: Request, res: Response) => {
  const { repoUrl, appId, name } = req.body as BuildRequest;
  if (!repoUrl || !appId) {
    return res.status(400).json({ error: 'repoUrl and appId are required' });
  }

  const buildDir = `/tmp/builds/${appId}`;
  const containerName = `deployshield-app-${appId}`;
  const imageName = `deployshield-app-${appId}:latest`;
  // Random dynamic host port allocation between 8080 and 8999
  const hostPort = 8080 + Math.floor(Math.random() * 900);
  const targetUrl = `http://${containerName}:3000`;

  try {
    console.log(`[Build] Starting build job for app [${appId}] from ${repoUrl}`);

    // Step 1: Prepare directory & obtain repository source code
    if (fs.existsSync(buildDir)) {
      fs.rmSync(buildDir, { recursive: true, force: true });
    }
    fs.mkdirSync(buildDir, { recursive: true });

    if (repoUrl === 'local://sample-app' || repoUrl === '/app/sample-app') {
      console.log(`[Build] Using local sample app template at /app/sample-app`);
      await execAsync(`cp -r /app/sample-app/* ${buildDir}/`);
    } else {
      console.log(`[Build] Executing git clone for ${repoUrl}`);
      await execAsync(`git clone --depth 1 "${repoUrl}" "${buildDir}"`);
    }

    // Step 2: Verify Dockerfile exists or auto-generate for common runtimes
    const dockerfilePath = path.join(buildDir, 'Dockerfile');
    if (!fs.existsSync(dockerfilePath)) {
      if (fs.existsSync(path.join(buildDir, 'package.json'))) {
        console.log(`[Build] No Dockerfile found; auto-generating Node.js Dockerfile for ${repoUrl}...`);
        const generatedDockerfile = `FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install
RUN if npm run | grep -q "build"; then npm run build; fi
EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
CMD ["npm", "start"]
`;
        fs.writeFileSync(dockerfilePath, generatedDockerfile);
      } else if (fs.existsSync(path.join(buildDir, 'requirements.txt'))) {
        console.log(`[Build] No Dockerfile found; auto-generating Python Dockerfile for ${repoUrl}...`);
        const generatedDockerfile = `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 3000
ENV PORT=3000
CMD ["python", "app.py"]
`;
        fs.writeFileSync(dockerfilePath, generatedDockerfile);
      } else if (fs.existsSync(path.join(buildDir, 'backend/requirements.txt'))) {
        console.log(`[Build] Detected Python service in backend/; auto-generating Dockerfile for ${repoUrl}...`);
        const generatedDockerfile = `FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
EXPOSE 3000
ENV PORT=3000
CMD ["sh", "-c", "python seed.py 2>/dev/null || true; gunicorn --bind 0.0.0.0:3000 --workers 1 run:app || python run.py || python app.py"]
`;
        fs.writeFileSync(dockerfilePath, generatedDockerfile);
      } else if (fs.existsSync(path.join(buildDir, 'backend/package.json'))) {
        console.log(`[Build] Detected Node service in backend/; auto-generating Dockerfile for ${repoUrl}...`);
        const generatedDockerfile = `FROM node:20-alpine
WORKDIR /app
COPY backend/ .
RUN npm install
RUN if npm run | grep -q "build"; then npm run build; fi
EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
CMD ["npm", "start"]
`;
        fs.writeFileSync(dockerfilePath, generatedDockerfile);
      } else if (fs.existsSync(path.join(buildDir, 'frontend/package.json'))) {
        console.log(`[Build] Detected frontend service; auto-generating Dockerfile for ${repoUrl}...`);
        const generatedDockerfile = `FROM node:20-alpine
WORKDIR /app
COPY frontend/ .
RUN npm install
RUN npm run build
RUN npm install -g serve
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
`;
        fs.writeFileSync(dockerfilePath, generatedDockerfile);
      } else {
        throw new Error(`No Dockerfile found in cloned repository at ${repoUrl}`);
      }
    }

    // Step 3: Build Docker Image
    console.log(`[Build] Building Docker image ${imageName}...`);
    await execAsync(`docker build -t "${imageName}" "${buildDir}"`);

    // Step 4: Stop & Remove old container if exists
    try {
      await execAsync(`docker rm -f "${containerName}"`);
    } catch (_) {
      // Ignore if container doesn't exist
    }

    // Step 5: Run Docker Container attached to DeployShield bridge network
    console.log(`[Build] Launching container ${containerName} on network ${DOCKER_NETWORK} (host port ${hostPort})...`);
    await execAsync(
      `docker run -d --name "${containerName}" --network "${DOCKER_NETWORK}" -p ${hostPort}:3000 "${imageName}"`
    );

    // Step 6: Register container endpoint with api-server
    console.log(`[Build] Registering ${appId} -> ${targetUrl} with api-server`);
    const regResponse = await fetch(`${API_SERVER_URL}/api/apps/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: appId,
        name: name || appId,
        repoUrl,
        targetUrl,
        hostPort
      })
    });

    const regData = await regResponse.json();

    res.status(200).json({
      success: true,
      message: 'Container built and deployed successfully',
      appId,
      imageName,
      containerName,
      targetUrl,
      hostPort,
      registration: regData
    });
  } catch (err: any) {
    console.error(`[Build Error] Failed building app ${appId}:`, err);
    res.status(500).json({
      success: false,
      error: err.message,
      appId
    });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Build Service listening on port ${PORT}`);
  });
}

export default app;

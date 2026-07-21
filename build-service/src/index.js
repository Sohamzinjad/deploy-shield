const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const execAsync = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 5001;
const API_SERVER_URL = process.env.API_SERVER_URL || 'http://api-server:5000';
const DOCKER_NETWORK = process.env.DOCKER_NETWORK || 'deployshield-net';

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ service: 'build-service', status: 'ok' });
});

// POST /build - Clone git repo, build Docker image, run container & register with api-server
app.post('/build', async (req, res) => {
  const { repoUrl, appId, name } = req.body;
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

    // Step 2: Verify Dockerfile exists
    if (!fs.existsSync(path.join(buildDir, 'Dockerfile'))) {
      throw new Error(`No Dockerfile found in cloned repository at ${repoUrl}`);
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
  } catch (err) {
    console.error(`[Build Error] Failed building app ${appId}:`, err);
    res.status(500).json({
      success: false,
      error: err.message,
      appId
    });
  }
});

app.listen(PORT, () => {
  console.log(`Build Service listening on port ${PORT}`);
});

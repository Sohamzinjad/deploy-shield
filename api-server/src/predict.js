const { PythonShell } = require('python-shell');
const path = require('path');
const fs = require('fs');

function findFirstExistingPath(paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return paths[0];
}

const candidateModelPaths = [
  process.env.MODEL_PATH,
  path.resolve(__dirname, '../../ml-service/models/baseline.pkl'),
  path.resolve(__dirname, '../ml-service/models/baseline.pkl'),
  path.resolve(__dirname, '../models/baseline.pkl'),
  '/app/ml-service/models/baseline.pkl'
].filter(Boolean);

const candidateScriptDirs = [
  process.env.ML_SCRIPT_DIR,
  path.resolve(__dirname, '../../ml-service'),
  path.resolve(__dirname, '../ml-service'),
  '/app/ml-service'
].filter(Boolean);

function predict(requestObj) {
  return new Promise((resolve, reject) => {
    const modelPath = findFirstExistingPath(candidateModelPaths);
    const scriptDir = findFirstExistingPath(candidateScriptDirs);

    const options = {
      mode: 'json',
      pythonOptions: ['-u'],
      scriptPath: scriptDir,
      args: [modelPath]
    };

    const pyshell = new PythonShell('predict_helper.py', options);
    let output = null;

    pyshell.on('message', (message) => {
      output = message;
    });

    pyshell.on('error', (err) => {
      reject(err);
    });

    pyshell.on('close', () => {
      resolve(output ? output.prediction : null);
    });

    // Pass the object directly; python-shell in json mode stringifies it automatically
    pyshell.send(requestObj);
    pyshell.end();
  });
}

module.exports = { predict };

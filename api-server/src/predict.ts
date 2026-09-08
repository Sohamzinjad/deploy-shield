import { PythonShell, Options } from 'python-shell';
import path from 'path';
import fs from 'fs';

function findFirstExistingPath(paths: string[]): string {
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
].filter((p): p is string => Boolean(p));

const candidateScriptDirs = [
  process.env.ML_SCRIPT_DIR,
  path.resolve(__dirname, '../../ml-service'),
  path.resolve(__dirname, '../ml-service'),
  '/app/ml-service'
].filter((p): p is string => Boolean(p));

export function predict(requestObj: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const modelPath = findFirstExistingPath(candidateModelPaths);
    const scriptDir = findFirstExistingPath(candidateScriptDirs);

    const options: Options = {
      mode: 'json',
      pythonOptions: ['-u'],
      scriptPath: scriptDir,
      args: [modelPath]
    };

    const pyshell = new PythonShell('predict_helper.py', options);
    let output: any = null;

    pyshell.on('message', (message: any) => {
      output = message;
    });

    pyshell.on('error', (err: Error) => {
      reject(err);
    });

    pyshell.on('close', () => {
      resolve(output ? output.prediction : null);
    });

    // Pass the object directly; python-shell in json mode stringifies it automatically
    pyshell.send(requestObj);
    pyshell.end((err) => {
      if (err) reject(err);
    });
  });
}

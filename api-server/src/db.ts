import { Pool, PoolConfig } from 'pg';
import fs from 'fs';
import path from 'path';

const databaseUrl = process.env.DATABASE_URL || '';
const requiresSsl =
  process.env.DATABASE_SSL === 'true' ||
  databaseUrl.includes('sslmode=require') ||
  databaseUrl.includes('neon.tech') ||
  process.env.NODE_ENV === 'production';

const poolConfig: PoolConfig = {
  connectionString: databaseUrl || 'postgresql://postgres:postgres@localhost:5432/deployshield'
};

if (requiresSsl) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

export const pool = new Pool(poolConfig);

pool.on('error', (err: Error) => {
  console.error('[Database Pool Error]', err.message);
});

// Run init.sql if present
export async function runMigrations(): Promise<boolean> {
  const candidatePaths = [
    '/db/init.sql',
    path.resolve(__dirname, '../../db/init.sql'),
    path.resolve(__dirname, '../db/init.sql'),
    path.resolve(__dirname, 'init.sql')
  ];

  for (const sqlPath of candidatePaths) {
    if (fs.existsSync(sqlPath)) {
      try {
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await pool.query(sql);
        console.log(`[Database] Migrations applied successfully from ${sqlPath}`);
        return true;
      } catch (err: any) {
        console.error(`[Database Error] Failed applying migrations from ${sqlPath}:`, err.message);
      }
    }
  }
  return false;
}

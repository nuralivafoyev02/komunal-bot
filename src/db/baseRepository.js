'use strict';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const IS_VERCEL = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DB_DIR = IS_VERCEL ? '/tmp/json' : join(__dirname, 'json');

if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

function createRepository(collection) {
  const filePath = join(DB_DIR, `${collection}.json`);

  if (!existsSync(filePath)) {
    try {
      writeFileSync(filePath, JSON.stringify({}, null, 2));
    } catch (e) {
      console.warn(`Warning: Could not create initial file ${filePath}. This is expected on read-only systems if not using /tmp.`);
    }
  }

  function read() {
    try {
      if (!existsSync(filePath)) return {};
      return JSON.parse(readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.error(`Error reading ${collection}:`, e);
      return {};
    }
  }

  function write(data) {
    try {
      writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error(`Error writing ${collection}:`, e);
      if (e.code === 'EROFS') {
        console.error('FATAL: Attempted to write to a read-only filesystem. Are you sure DB_DIR is set correctly for Vercel?');
      }
    }
  }

  return {
    findById: (id) => {
      const data = read();
      return data[String(id)] || null;
    },
    findMany: (predicate) => {
      return Object.values(read()).filter(predicate);
    },
    save: (id, record) => {
      const data = read();
      data[String(id)] = record;
      write(data);
      return record;
    },
    remove: (id) => {
      const data = read();
      delete data[String(id)];
      write(data);
    },
    findAll: () => {
      return Object.values(read());
    },
    values: () => {
      return Object.values(read());
    },
    count: () => {
      return Object.keys(read()).length;
    },
    all: () => {
      return read();
    }
  };
}

export { createRepository };

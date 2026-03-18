'use strict';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_DIR = join(__dirname, 'json');

if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

function createRepository(collection) {
  const filePath = join(DB_DIR, `${collection}.json`);

  if (!existsSync(filePath)) {
    writeFileSync(filePath, JSON.stringify({}, null, 2));
  }

  function read() {
    try {
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
    }
  }

  return {
    findById: (id) => {
      const data = read();
      return data[String(id)] || null;
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

'use strict';
const fs   = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, 'json');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

function createRepository(collection) {
  const filePath = path.join(DB_DIR, `${collection}.json`);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({}, null, 2));
  }

  function read() {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.error(`Error reading ${collection}:`, e);
      return {};
    }
  }

  function write(data) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
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

module.exports = { createRepository };

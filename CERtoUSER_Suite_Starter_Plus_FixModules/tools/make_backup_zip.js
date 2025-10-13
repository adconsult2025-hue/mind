#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const timestamp = new Date();
const pad = (value) => String(value).padStart(2, '0');
const stamp = [
  timestamp.getFullYear(),
  pad(timestamp.getMonth() + 1),
  pad(timestamp.getDate())
].join('');

const output = path.join(distDir, `backup-${stamp}.zip`);

const exclusions = ['node_modules', '.git'];
const excludeArgs = exclusions.map((item) => `-x "${item}/*"`).join(' ');

const command = `zip -r "${output}" . ${excludeArgs}`;

try {
  execSync(command, {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  console.log(`Backup creato: ${output}`);
} catch (err) {
  console.error('Errore durante la creazione del backup:', err.message);
  process.exit(1);
}

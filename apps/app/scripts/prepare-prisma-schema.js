#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetDir = path.join(appRoot, 'prisma/schema');
const sourceDir = path.resolve(appRoot, '../../packages/db/prisma/schema');

const schemaHeader = `generator client {
  provider = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  extensions = [pgcrypto]
}
`;

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
const schemaFiles = fs
  .readdirSync(sourceDir)
  .filter((file) => file.endsWith('.prisma') && file !== 'schema.prisma')
  .sort();

const combinedSchema = schemaFiles.reduce((schema, file) => {
  const content = fs.readFileSync(path.join(sourceDir, file), 'utf8');
  return `${schema}\n\n// ===== ${file} =====\n${content}`;
}, schemaHeader);

fs.writeFileSync(path.join(targetDir, 'schema.prisma'), combinedSchema);

console.log(`Prepared Prisma schema from ${sourceDir}`);

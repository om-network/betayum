import { readFileSync } from 'node:fs';

const rootDockerfile = readFileSync('Dockerfile', 'utf8');
const apiDockerfile = readFileSync('apps/api/Dockerfile.multistage', 'utf8');
const servicesTf = readFileSync('infra/gcp/services.tf', 'utf8');
const localsTf = readFileSync('infra/gcp/locals.tf', 'utf8');
const dockerDocs = readFileSync('docs/deploy/cloud-run-docker.md', 'utf8');

const requiredRootSnippets = [
  'FROM oven/bun:1.2.8 AS migrator',
  'FROM node:22-alpine AS app',
  'FROM node:22-alpine AS portal',
  'ARG NEXT_PUBLIC_BETTER_AUTH_URL',
  'ARG NEXT_PUBLIC_PORTAL_URL',
  'ARG NEXT_PUBLIC_API_URL',
];

const requiredApiSnippets = [
  'ENV PORT=3333',
  'USER nestjs',
  'http://localhost:3333/v1/health',
];

const requiredInfraSnippets = [
  'api = {',
  'port = 3333',
  'app = {',
  'portal = {',
  'port = 3000',
];

const requiredDocSnippets = [
  'docker build -f apps/api/Dockerfile.multistage',
  'docker build -f Dockerfile --target app',
  'docker build -f Dockerfile --target portal',
  'docker build -f Dockerfile --target migrator',
  '/v1/health',
  '/api/health',
];

function assertIncludes({
  source,
  snippets,
  label,
}) {
  for (const snippet of snippets) {
    if (!source.includes(snippet)) {
      throw new Error(`${label} is missing: ${snippet}`);
    }
  }
}

assertIncludes({
  source: rootDockerfile,
  snippets: requiredRootSnippets,
  label: 'root Dockerfile',
});
assertIncludes({
  source: apiDockerfile,
  snippets: requiredApiSnippets,
  label: 'API Dockerfile',
});
assertIncludes({
  source: `${localsTf}\n${servicesTf}`,
  snippets: requiredInfraSnippets,
  label: 'Cloud Run service contract',
});
assertIncludes({
  source: dockerDocs,
  snippets: requiredDocSnippets,
  label: 'Cloud Run Docker docs',
});

console.log('Cloud Run Docker contracts are documented and wired.');

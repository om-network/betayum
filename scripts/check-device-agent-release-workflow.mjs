import { readFileSync } from 'node:fs';

const workflowPath = process.argv[2] ?? '.github/workflows/device-agent-release.yml';
const workflow = readFileSync(workflowPath, 'utf8');
const signingGuard = "if: steps.windows_signing.outputs.enabled == 'true'";

function fail(message) {
  console.error(`device-agent release workflow check failed: ${message}`);
  process.exitCode = 1;
}

function getStepBlock(name) {
  const startMarker = `      - name: ${name}`;
  const start = workflow.indexOf(startMarker);
  if (start === -1) {
    fail(`missing step "${name}"`);
    return '';
  }

  const rest = workflow.slice(start + startMarker.length);
  const nextStep = rest.search(/\n      - name: /);
  return workflow.slice(start, nextStep === -1 ? workflow.length : start + startMarker.length + nextStep);
}

const detectStep = getStepBlock('Detect Windows signing secrets');
if (!detectStep.includes('id: windows_signing')) {
  fail('Windows signing detection step must expose id "windows_signing"');
}
if (!detectStep.includes('enabled=false')) {
  fail('Windows signing detection step must allow unsigned builds when ESIGNER secrets are absent');
}
if (!detectStep.includes('GITHUB_REF_NAME: ${{ github.ref_name }}')) {
  fail('Windows signing detection step must receive the GitHub branch name');
}
if (!detectStep.includes('$env:GITHUB_REF_NAME -eq "release"')) {
  fail('Windows signing detection step must identify release branch builds');
}
if (!detectStep.includes('Windows production releases require ESIGNER secrets for code signing.')) {
  fail('Windows signing detection step must fail production releases without ESIGNER secrets');
}

for (const stepName of [
  'Setup Java for CodeSignTool',
  'Sign Windows EXE with SSL.com CodeSignTool',
  'Verify Windows code signature',
  'Recalculate latest.yml hash after signing',
]) {
  const step = getStepBlock(stepName);
  if (!step.includes(signingGuard)) {
    fail(`"${stepName}" must be gated by Windows signing secrets`);
  }
}

const uploadStep = getStepBlock('Upload Windows artifact');
if (uploadStep.includes(signingGuard)) {
  fail('Windows artifact upload must still run for unsigned builds');
}

if (!process.exitCode) {
  console.log('device-agent release workflow signing guards are valid');
}

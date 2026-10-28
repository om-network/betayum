import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';

test('task deployment defers only for a stopped VM', () => {
  const directory = mkdtempSync(`${tmpdir()}/trigger-deploy-test-`);
  const mock = resolve(directory, 'gcloud');
  writeFileSync(
    mock,
    '#!/bin/sh\nif [ "$MOCK_LOOKUP_FAILURE" = 1 ]; then exit 7; fi\nprintf "%s\\n" "$MOCK_VM_STATUS"\n',
  );
  chmodSync(mock, 0o755);
  try {
    for (const [status, lookupFailure, expected] of [
      ['TERMINATED', '0', 0],
      ['RUNNING', '0', 66], // Continues to the required archive check.
      ['STOPPING', '0', 1],
      ['TERMINATED', '1', 7], // Permission/network failures must remain failures.
    ]) {
      const result = spawnSync('bash', ['scripts/deploy-trigger-tasks-gce.sh'], {
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          PROJECT_ID: 'test-project',
          TRIGGER_ZONE: 'test-zone',
          TRIGGER_VM: 'test-vm',
          TRIGGER_DEPLOYER_IMAGE: 'test-image',
          COMMIT_SHA: 'deadbeef',
          MOCK_VM_STATUS: status,
          MOCK_LOOKUP_FAILURE: lookupFailure,
        },
        encoding: 'utf8',
      });
      assert.equal(result.status, expected, result.stderr);
      if (expected === 0) assert.match(result.stdout, /task deployment deferred/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

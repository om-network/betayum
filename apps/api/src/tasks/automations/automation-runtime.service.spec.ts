import { ServiceUnavailableException } from '@nestjs/common';
import { AutomationRuntimeService } from './automation-runtime.service';

describe('AutomationRuntimeService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('reports generation and execution enabled by default', () => {
    delete process.env.TASK_AUTOMATIONS_ENABLED;
    delete process.env.TASK_AUTOMATION_EXECUTION_ENABLED;
    delete process.env.TASK_AUTOMATION_WORKER_HEALTH;

    const service = new AutomationRuntimeService();

    expect(service.getServiceState()).toEqual({
      success: true,
      state: {
        availability: 'enabled',
        generationEnabled: true,
        executionEnabled: true,
        workerHealthy: true,
      },
    });
  });

  it('reports disabled availability when the operator kill switch is off', () => {
    process.env.TASK_AUTOMATIONS_ENABLED = 'false';

    const service = new AutomationRuntimeService();

    expect(service.getServiceState().state).toMatchObject({
      availability: 'disabled',
      generationEnabled: false,
      executionEnabled: false,
      workerHealthy: true,
    });
  });

  it('reports execution disabled separately from full availability', () => {
    process.env.TASK_AUTOMATION_EXECUTION_ENABLED = 'false';

    const service = new AutomationRuntimeService();

    expect(service.getServiceState().state).toMatchObject({
      availability: 'execution_disabled',
      generationEnabled: true,
      executionEnabled: false,
      workerHealthy: true,
    });
  });

  it('reports unhealthy when the worker health gate fails', () => {
    process.env.TASK_AUTOMATION_WORKER_HEALTH = 'unhealthy';

    const service = new AutomationRuntimeService();

    expect(service.getServiceState().state).toMatchObject({
      availability: 'unhealthy',
      generationEnabled: true,
      executionEnabled: true,
      workerHealthy: false,
    });
  });

  it('builds a constrained worker execution request', () => {
    const service = new AutomationRuntimeService();

    const request = service.buildExecutionRequest({
      organizationId: 'org_1',
      taskId: 'tsk_1',
      automationId: 'aut_1',
      runId: 'ear_1',
      version: 2,
      artifactKey: 'org_1/tasks/tsk_1/automations/aut_1/v2.js',
      trigger: 'manual',
      secretRefs: [{ name: 'github-token', category: 'automation' }],
      tools: [{ type: 'http', allowedHosts: ['api.github.com'] }],
      sandbox: {
        timeoutMs: 120000,
        networkPolicy: 'approved_hosts_only',
      },
    });

    expect(request).toEqual({
      organizationId: 'org_1',
      taskId: 'tsk_1',
      automationId: 'aut_1',
      runId: 'ear_1',
      version: 2,
      artifactKey: 'org_1/tasks/tsk_1/automations/aut_1/v2.js',
      trigger: 'manual',
      secretRefs: [{ name: 'github-token', category: 'automation' }],
      tools: [{ type: 'http', allowedHosts: ['api.github.com'] }],
      sandbox: {
        timeoutMs: 120000,
        networkPolicy: 'approved_hosts_only',
      },
    });
  });

  it('rejects raw secrets and arbitrary shell access in worker requests', () => {
    const service = new AutomationRuntimeService();

    expect(() =>
      service.buildExecutionRequest({
        organizationId: 'org_1',
        taskId: 'tsk_1',
        automationId: 'aut_1',
        runId: 'ear_1',
        version: 2,
        artifactKey: 'org_1/tasks/tsk_1/automations/aut_1/v2.js',
        trigger: 'manual',
        rawSecrets: { token: 'secret-token' },
      }),
    ).toThrow(ServiceUnavailableException);

    expect(() =>
      service.buildExecutionRequest({
        organizationId: 'org_1',
        taskId: 'tsk_1',
        automationId: 'aut_1',
        runId: 'ear_1',
        version: 2,
        artifactKey: 'org_1/tasks/tsk_1/automations/aut_1/v2.js',
        trigger: 'manual',
        shell: 'curl http://metadata.google.internal',
      }),
    ).toThrow(ServiceUnavailableException);
  });

  it('rejects internal network targets in approved hosts', () => {
    const service = new AutomationRuntimeService();

    expect(() =>
      service.buildExecutionRequest({
        organizationId: 'org_1',
        taskId: 'tsk_1',
        automationId: 'aut_1',
        runId: 'ear_1',
        version: 2,
        artifactKey: 'org_1/tasks/tsk_1/automations/aut_1/v2.js',
        trigger: 'manual',
        tools: [{ type: 'http', allowedHosts: ['localhost'] }],
      }),
    ).toThrow(ServiceUnavailableException);
  });

  it('sanitizes secret-like fields from run output', () => {
    const service = new AutomationRuntimeService();

    expect(
      service.sanitizeRunOutput({
        status: 'failed',
        token: 'ghp_secret',
        nested: {
          Authorization: 'Bearer abc123',
          message: 'request failed',
          values: [{ password: 'super-secret' }, 'safe text'],
        },
      }),
    ).toEqual({
      status: 'failed',
      token: '[redacted]',
      nested: {
        Authorization: '[redacted]',
        message: 'request failed',
        values: [{ password: '[redacted]' }, 'safe text'],
      },
    });
  });
});

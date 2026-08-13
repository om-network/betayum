import { ServiceUnavailableException } from '@nestjs/common';
import { GcpComputeService } from './gcp-compute.service';

describe('GcpComputeService viewer URLs', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLocalViewerUrl = process.env.BROWSER_VM_LOCAL_VIEWER_URL;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalLocalViewerUrl === undefined) {
      delete process.env.BROWSER_VM_LOCAL_VIEWER_URL;
    } else {
      process.env.BROWSER_VM_LOCAL_VIEWER_URL = originalLocalViewerUrl;
    }
  });

  it('uses the VM private viewer endpoint by default', () => {
    delete process.env.BROWSER_VM_LOCAL_VIEWER_URL;
    const service = new GcpComputeService();

    expect(service.getViewerHttpUrl({ internalIp: '10.80.0.4' })).toBe(
      'http://10.80.0.4:6080/vnc.html',
    );
    expect(service.getViewerWebSocketUrl({ internalIp: '10.80.0.4' })).toBe(
      'ws://10.80.0.4:6080/websockify',
    );
  });

  it('uses a loopback tunnel during local development', () => {
    process.env.NODE_ENV = 'development';
    process.env.BROWSER_VM_LOCAL_VIEWER_URL = 'http://127.0.0.1:16080';
    const service = new GcpComputeService();

    expect(service.getViewerHttpUrl({ internalIp: '10.80.0.4' })).toBe(
      'http://127.0.0.1:16080/vnc.html',
    );
    expect(service.getViewerWebSocketUrl({ internalIp: '10.80.0.4' })).toBe(
      'ws://127.0.0.1:16080/websockify',
    );
  });

  it('ignores the local override in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.BROWSER_VM_LOCAL_VIEWER_URL = 'http://127.0.0.1:16080';
    const service = new GcpComputeService();

    expect(service.getViewerWebSocketUrl({ internalIp: '10.80.0.4' })).toBe(
      'ws://10.80.0.4:6080/websockify',
    );
  });

  it('rejects a non-loopback local override', () => {
    process.env.NODE_ENV = 'development';
    process.env.BROWSER_VM_LOCAL_VIEWER_URL = 'http://10.80.0.4:6080';
    const service = new GcpComputeService();

    expect(() => service.getViewerHttpUrl({ internalIp: '10.80.0.4' })).toThrow(
      ServiceUnavailableException,
    );
  });
});

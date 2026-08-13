import { ServiceUnavailableException } from '@nestjs/common';
import { GcpComputeService } from './gcp-compute.service';

describe('GcpComputeService viewer URLs', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLocalSshHost = process.env.BROWSER_VM_LOCAL_SSH_HOST;
  const originalLocalSshPort = process.env.BROWSER_VM_LOCAL_SSH_PORT;
  const originalLocalViewerUrl = process.env.BROWSER_VM_LOCAL_VIEWER_URL;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalLocalSshHost === undefined) {
      delete process.env.BROWSER_VM_LOCAL_SSH_HOST;
    } else {
      process.env.BROWSER_VM_LOCAL_SSH_HOST = originalLocalSshHost;
    }
    if (originalLocalSshPort === undefined) {
      delete process.env.BROWSER_VM_LOCAL_SSH_PORT;
    } else {
      process.env.BROWSER_VM_LOCAL_SSH_PORT = originalLocalSshPort;
    }
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
    process.env.BROWSER_VM_LOCAL_SSH_HOST = '127.0.0.1';
    process.env.BROWSER_VM_LOCAL_SSH_PORT = '16022';
    process.env.BROWSER_VM_LOCAL_VIEWER_URL = 'http://127.0.0.1:16080';
    const service = new GcpComputeService();

    expect(service.getViewerHttpUrl({ internalIp: '10.80.0.4' })).toBe(
      'http://127.0.0.1:16080/vnc.html',
    );
    expect(service.getViewerWebSocketUrl({ internalIp: '10.80.0.4' })).toBe(
      'ws://127.0.0.1:16080/websockify',
    );
    expect(service.getSshTarget({ internalIp: '10.80.0.4' })).toEqual({
      host: '127.0.0.1',
      port: 16022,
    });
  });

  it('ignores the local override in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.BROWSER_VM_LOCAL_SSH_HOST = '127.0.0.1';
    process.env.BROWSER_VM_LOCAL_SSH_PORT = '16022';
    process.env.BROWSER_VM_LOCAL_VIEWER_URL = 'http://127.0.0.1:16080';
    const service = new GcpComputeService();

    expect(service.getViewerWebSocketUrl({ internalIp: '10.80.0.4' })).toBe(
      'ws://10.80.0.4:6080/websockify',
    );
    expect(service.getSshTarget({ internalIp: '10.80.0.4' })).toEqual({
      host: '10.80.0.4',
      port: 22,
    });
  });

  it('rejects a non-loopback local override', () => {
    process.env.NODE_ENV = 'development';
    process.env.BROWSER_VM_LOCAL_VIEWER_URL = 'http://10.80.0.4:6080';
    const service = new GcpComputeService();

    expect(() => service.getViewerHttpUrl({ internalIp: '10.80.0.4' })).toThrow(
      ServiceUnavailableException,
    );
  });

  it('uses the VM private SSH endpoint by default', () => {
    delete process.env.BROWSER_VM_LOCAL_SSH_HOST;
    delete process.env.BROWSER_VM_LOCAL_SSH_PORT;
    const service = new GcpComputeService();

    expect(service.getSshTarget({ internalIp: '10.80.0.4' })).toEqual({
      host: '10.80.0.4',
      port: 22,
    });
  });

  it('rejects a non-loopback local SSH target', () => {
    process.env.NODE_ENV = 'development';
    process.env.BROWSER_VM_LOCAL_SSH_HOST = '10.80.0.4';
    process.env.BROWSER_VM_LOCAL_SSH_PORT = '16022';
    const service = new GcpComputeService();

    expect(() => service.getSshTarget({ internalIp: '10.80.0.4' })).toThrow(
      ServiceUnavailableException,
    );
  });
});

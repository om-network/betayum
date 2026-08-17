import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';
import { isPrivateIpv4 } from './browser-vm-network.util';

const computeOperationSchema = z.object({
  name: z.string(),
});

const localViewerUrlSchema = z.string().url();
const localSshPortSchema = z.coerce.number().int().min(1024).max(65535);

const computeInstanceSchema = z.object({
  id: z.string(),
  metadata: z
    .object({
      fingerprint: z.string(),
      items: z
        .array(z.object({ key: z.string(), value: z.string().optional() }))
        .default([]),
    })
    .optional(),
  name: z.string(),
  status: z.string(),
  networkInterfaces: z
    .array(
      z.object({
        networkIP: z.string().optional(),
      }),
    )
    .default([]),
});

export interface BrowserComputeInstance {
  id: string;
  internalIp: string | null;
  name: string;
  status: string;
}

export interface BrowserSshTarget {
  host: string;
  port: number;
}

@Injectable()
export class GcpComputeService {
  private readonly auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/compute'],
  });

  get projectId(): string {
    return this.getRequiredConfig('BROWSER_VM_GCP_PROJECT');
  }

  get zone(): string {
    return process.env.BROWSER_VM_GCP_ZONE || 'us-central1-a';
  }

  async createInstance(instanceName: string): Promise<string> {
    const template = this.getRequiredConfig('BROWSER_VM_INSTANCE_TEMPLATE');
    const client = await this.auth.getClient();
    const sourceTemplate =
      template.startsWith('projects/') || template.startsWith('https://')
        ? template
        : `projects/${this.projectId}/global/instanceTemplates/${template}`;
    const url = new URL(
      `${this.instancesBaseUrl()}?sourceInstanceTemplate=${encodeURIComponent(sourceTemplate)}`,
    );
    const response = await client.request({
      method: 'POST',
      url: url.toString(),
      data: {
        name: instanceName,
        serviceAccounts: [
          {
            email: `betayum-codex-${instanceName.slice(-16)}@${this.projectId}.iam.gserviceaccount.com`,
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          },
        ],
      },
    });

    return computeOperationSchema.parse(response.data).name;
  }

  async getInstance(
    instanceName: string,
  ): Promise<BrowserComputeInstance | null> {
    const client = await this.auth.getClient();

    try {
      const response = await client.request({
        method: 'GET',
        url: `${this.instancesBaseUrl()}/${encodeURIComponent(instanceName)}`,
      });
      const instance = computeInstanceSchema.parse(response.data);
      return {
        id: instance.id,
        internalIp: instance.networkInterfaces[0]?.networkIP ?? null,
        name: instance.name,
        status: instance.status,
      };
    } catch (error) {
      if (this.getResponseStatus(error) === 404) {
        return null;
      }
      throw error;
    }
  }

  async startInstance(instanceName: string): Promise<string> {
    return this.runInstanceAction({ instanceName, action: 'start' });
  }

  async stopInstance(instanceName: string): Promise<string> {
    return this.runInstanceAction({ instanceName, action: 'stop' });
  }

  async setMetadataItem({
    instanceName,
    key,
    value,
  }: {
    instanceName: string;
    key: string;
    value: string;
  }): Promise<string> {
    const client = await this.auth.getClient();
    const instanceUrl = `${this.instancesBaseUrl()}/${encodeURIComponent(instanceName)}`;
    const current = await client.request({ method: 'GET', url: instanceUrl });
    const instance = computeInstanceSchema.parse(current.data);
    if (!instance.metadata) {
      throw new ServiceUnavailableException(
        `Browser VM metadata is unavailable: ${instanceName}`,
      );
    }

    const items = instance.metadata.items
      .filter((item) => item.key !== key)
      .concat({ key, value });
    const response = await client.request({
      method: 'POST',
      url: `${instanceUrl}/setMetadata`,
      data: { fingerprint: instance.metadata.fingerprint, items },
    });
    return computeOperationSchema.parse(response.data).name;
  }

  async isViewerReady(internalIp: string): Promise<boolean> {
    if (!isPrivateIpv4(internalIp)) {
      return false;
    }

    try {
      const response = await fetch(this.getViewerHttpUrl({ internalIp }), {
        signal: AbortSignal.timeout(2500),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  getViewerHttpUrl({ internalIp }: { internalIp: string }): string {
    const url = this.getViewerBaseUrl({ internalIp });
    url.pathname = '/vnc.html';
    return url.toString();
  }

  getViewerWebSocketUrl({ internalIp }: { internalIp: string }): string {
    const url = this.getViewerBaseUrl({ internalIp });
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/websockify';
    return url.toString();
  }

  getSshTarget({ internalIp }: { internalIp: string }): BrowserSshTarget {
    if (!isPrivateIpv4(internalIp)) {
      throw new ServiceUnavailableException(
        'Browser VM SSH target must use a private IPv4 address',
      );
    }

    const host = process.env.BROWSER_VM_LOCAL_SSH_HOST;
    const port = process.env.BROWSER_VM_LOCAL_SSH_PORT;
    if ((!host && !port) || process.env.NODE_ENV === 'production') {
      return { host: internalIp, port: 22 };
    }

    const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);
    const parsedPort = localSshPortSchema.safeParse(port);
    if (!host || !loopbackHosts.has(host) || !parsedPort.success) {
      throw new ServiceUnavailableException(
        'Browser VM local SSH target must use a loopback host and valid port',
      );
    }
    return { host, port: parsedPort.data };
  }

  private async runInstanceAction({
    instanceName,
    action,
  }: {
    instanceName: string;
    action: 'start' | 'stop';
  }): Promise<string> {
    const client = await this.auth.getClient();
    const response = await client.request({
      method: 'POST',
      url: `${this.instancesBaseUrl()}/${encodeURIComponent(instanceName)}/${action}`,
    });
    return computeOperationSchema.parse(response.data).name;
  }

  private instancesBaseUrl(): string {
    return `https://compute.googleapis.com/compute/v1/projects/${encodeURIComponent(this.projectId)}/zones/${encodeURIComponent(this.zone)}/instances`;
  }

  private getRequiredConfig(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new ServiceUnavailableException(
        `Browser VM configuration is incomplete: ${name}`,
      );
    }
    return value;
  }

  private getViewerBaseUrl({ internalIp }: { internalIp: string }): URL {
    return this.getPrivateServiceBaseUrl({
      internalIp,
      localOverrideName: 'BROWSER_VM_LOCAL_VIEWER_URL',
      privatePort: 6080,
    });
  }

  private getPrivateServiceBaseUrl({
    internalIp,
    localOverrideName,
    privatePort,
  }: {
    internalIp: string;
    localOverrideName: string;
    privatePort: number;
  }): URL {
    const override = process.env[localOverrideName];
    if (!override || process.env.NODE_ENV === 'production') {
      return new URL(`http://${internalIp}:${privatePort}`);
    }

    const parsed = localViewerUrlSchema.safeParse(override);
    if (!parsed.success) {
      throw new ServiceUnavailableException(
        `${localOverrideName} must be a valid loopback HTTP URL`,
      );
    }

    const url = new URL(parsed.data);
    const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
    if (
      url.protocol !== 'http:' ||
      !loopbackHosts.has(url.hostname) ||
      url.username ||
      url.password
    ) {
      throw new ServiceUnavailableException(
        `${localOverrideName} must be a loopback HTTP URL`,
      );
    }
    return url;
  }

  private getResponseStatus(error: unknown): number | undefined {
    if (!error || typeof error !== 'object' || !('response' in error)) {
      return undefined;
    }
    const response = error.response;
    if (!response || typeof response !== 'object' || !('status' in response)) {
      return undefined;
    }
    return typeof response.status === 'number' ? response.status : undefined;
  }

  private isPrivateIpv4(value: string): boolean {
    const octets = value.split('.').map(Number);
    if (
      octets.length !== 4 ||
      octets.some(
        (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
      )
    ) {
      return false;
    }

    const [first, second] = octets;
    return (
      first === 10 ||
      (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }
}

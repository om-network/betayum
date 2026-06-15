import {
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Readable } from 'stream';

const mockGetDeviceAgentArtifactsBucketName = jest.fn<string | undefined, []>(
  () => 'device-bucket',
);

jest.mock('@/app/object-storage', () => ({
  getDeviceAgentArtifactsBucketName: () =>
    mockGetDeviceAgentArtifactsBucketName(),
  objectStorage: {
    streamObject: jest.fn(),
    getObjectMetadata: jest.fn(),
    getSignedObjectUrl: jest.fn(),
  },
}));

import { objectStorage } from '@/app/object-storage';
import { DeviceAgentService } from './device-agent.service';

const mockObjectStorage = objectStorage as jest.Mocked<typeof objectStorage>;

describe('DeviceAgentService', () => {
  let service: DeviceAgentService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDeviceAgentArtifactsBucketName.mockReturnValue('device-bucket');
    mockObjectStorage.streamObject.mockReturnValue(new Readable({ read() {} }));
    mockObjectStorage.getObjectMetadata.mockResolvedValue({
      contentLength: 859,
    });
    mockObjectStorage.getSignedObjectUrl.mockResolvedValue(
      'https://storage.example.com/signed',
    );
    service = new DeviceAgentService();
  });

  it('does not fail dependency injection when storage is not configured', async () => {
    mockGetDeviceAgentArtifactsBucketName.mockReturnValue(undefined);

    expect(() => new DeviceAgentService()).not.toThrow();
    await expect(service.downloadMacAgent()).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  describe('downloadMacAgent', () => {
    it('should return stream, filename, and contentType on success', async () => {
      const mockStream = new Readable({ read() {} });
      mockObjectStorage.streamObject.mockReturnValue(mockStream);

      const result = await service.downloadMacAgent();

      expect(result.stream).toBe(mockStream);
      expect(result.filename).toBe('CompAI-Device-Agent-arm64.dmg');
      expect(result.contentType).toBe('application/x-apple-diskimage');
      expect(mockObjectStorage.getObjectMetadata).toHaveBeenCalledWith({
        organizationId: 'device-agent',
        key: 'device-agent/production/macos/latest-arm64.dmg',
        bucketName: 'device-bucket',
      });
      expect(mockObjectStorage.streamObject).toHaveBeenCalledWith({
        organizationId: 'device-agent',
        key: 'device-agent/production/macos/latest-arm64.dmg',
        bucketName: 'device-bucket',
      });
    });

    it('should throw NotFoundException when storage throws NotFound', async () => {
      const error = new Error('Not found');
      error.name = 'NotFound';
      mockObjectStorage.getObjectMetadata.mockRejectedValue(error);

      await expect(service.downloadMacAgent()).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw InternalServerErrorException on other storage errors', async () => {
      mockObjectStorage.getObjectMetadata.mockRejectedValue(
        new Error('Network failure'),
      );

      await expect(service.downloadMacAgent()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('getUpdateFile', () => {
    it('streams .yml manifests directly from object storage', async () => {
      const mockStream = new Readable({ read() {} });
      mockObjectStorage.streamObject.mockReturnValue(mockStream);
      mockObjectStorage.getObjectMetadata.mockResolvedValue({
        contentLength: 859,
      });

      const result = await service.getUpdateFile({
        filename: 'latest-mac.yml',
      });

      expect(result).toEqual({
        kind: 'stream',
        stream: mockStream,
        contentType: 'text/yaml',
        contentLength: 859,
      });
      expect(mockObjectStorage.getSignedObjectUrl).not.toHaveBeenCalled();
      expect(mockObjectStorage.getObjectMetadata).toHaveBeenCalledWith({
        organizationId: 'device-agent',
        key: 'device-agent/production/updates/latest-mac.yml',
        bucketName: 'device-bucket',
      });
    });

    it('redirects binary downloads to a signed object URL', async () => {
      const result = await service.getUpdateFile({
        filename: 'CompAI-Device-Agent-1.0.5-arm64.zip',
      });

      expect(result).toEqual({
        kind: 'redirect',
        url: 'https://storage.example.com/signed',
      });
      expect(mockObjectStorage.streamObject).not.toHaveBeenCalled();
      expect(mockObjectStorage.getSignedObjectUrl).toHaveBeenCalledWith({
        organizationId: 'device-agent',
        key: 'device-agent/production/updates/CompAI-Device-Agent-1.0.5-arm64.zip',
        bucketName: 'device-bucket',
        action: 'read',
        expiresInSeconds: 3600,
      });
    });

    it.each([
      'CompAI-Device-Agent-1.0.5-arm64.zip',
      'CompAI-Device-Agent-1.0.5-setup.exe',
      'CompAI-Device-Agent-1.0.5-arm64.dmg',
      'CompAI-Device-Agent-1.0.5-x86_64.AppImage',
      'CompAI-Device-Agent-1.0.5-arm64.zip.blockmap',
    ])('redirects binary file %s', async (filename) => {
      const result = await service.getUpdateFile({ filename });

      expect(result).toEqual({
        kind: 'redirect',
        url: 'https://storage.example.com/signed',
      });
    });

    it('throws NotFoundException for invalid filenames', async () => {
      await expect(
        service.getUpdateFile({ filename: '../etc/passwd' }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.getUpdateFile({ filename: 'foo.txt' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when storage returns missing for a yml manifest', async () => {
      const error = new Error('Not found');
      error.name = 'NoSuchKey';
      mockObjectStorage.getObjectMetadata.mockRejectedValue(error);

      await expect(
        service.getUpdateFile({ filename: 'latest-mac.yml' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('headUpdateFile', () => {
    it('returns metadata for .yml manifests', async () => {
      mockObjectStorage.getObjectMetadata.mockResolvedValue({
        contentLength: 859,
      });

      const result = await service.headUpdateFile({
        filename: 'latest-mac.yml',
      });

      expect(result).toEqual({
        kind: 'metadata',
        contentType: 'text/yaml',
        contentLength: 859,
      });
      expect(mockObjectStorage.getSignedObjectUrl).not.toHaveBeenCalled();
    });

    it('serves binary HEAD metadata without a signed GET redirect', async () => {
      const result = await service.headUpdateFile({
        filename: 'CompAI-Device-Agent-1.0.5-arm64.zip',
      });

      expect(result).toEqual({
        kind: 'metadata',
        contentType: 'application/zip',
        contentLength: 859,
      });
      expect(mockObjectStorage.getObjectMetadata).toHaveBeenCalledWith({
        organizationId: 'device-agent',
        key: 'device-agent/production/updates/CompAI-Device-Agent-1.0.5-arm64.zip',
        bucketName: 'device-bucket',
      });
      expect(mockObjectStorage.getSignedObjectUrl).not.toHaveBeenCalled();
    });
  });

  describe('downloadWindowsAgent', () => {
    it('should return stream, filename, and contentType on success', async () => {
      const mockStream = new Readable({ read() {} });
      mockObjectStorage.streamObject.mockReturnValue(mockStream);

      const result = await service.downloadWindowsAgent();

      expect(result.stream).toBe(mockStream);
      expect(result.filename).toBe('CompAI-Device-Agent-setup.exe');
      expect(result.contentType).toBe('application/octet-stream');
      expect(mockObjectStorage.getObjectMetadata).toHaveBeenCalledWith({
        organizationId: 'device-agent',
        key: 'device-agent/production/windows/latest-setup.exe',
        bucketName: 'device-bucket',
      });
      expect(mockObjectStorage.streamObject).toHaveBeenCalledWith({
        organizationId: 'device-agent',
        key: 'device-agent/production/windows/latest-setup.exe',
        bucketName: 'device-bucket',
      });
    });

    it('should throw NotFoundException when storage throws missing', async () => {
      const error = new Error('Not found');
      error.name = 'NoSuchKey';
      mockObjectStorage.getObjectMetadata.mockRejectedValue(error);

      await expect(service.downloadWindowsAgent()).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw InternalServerErrorException on other storage errors', async () => {
      mockObjectStorage.getObjectMetadata.mockRejectedValue(
        new Error('Network failure'),
      );

      await expect(service.downloadWindowsAgent()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});

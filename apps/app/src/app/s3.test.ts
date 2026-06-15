import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = process.env;

function resetStorageEnv() {
  delete process.env.APP_OBJECT_STORAGE_BUCKET;
  delete process.env.APP_GCS_BUCKET_NAME;
  delete process.env.APP_GCP_BUCKET_NAME;
  delete process.env.APP_GCP_ORG_ASSETS_BUCKET;
  delete process.env.APP_GCP_QUESTIONNAIRE_UPLOAD_BUCKET;
  delete process.env.APP_GCP_KNOWLEDGE_BASE_BUCKET;
  delete process.env.APP_GCP_ACCESS_KEY_ID;
  delete process.env.APP_GCP_SECRET_ACCESS_KEY;
  delete process.env.APP_GCP_ENDPOINT;
  delete process.env.APP_AWS_BUCKET_NAME;
  delete process.env.APP_AWS_ORG_ASSETS_BUCKET;
  delete process.env.APP_AWS_ACCESS_KEY_ID;
  delete process.env.APP_AWS_SECRET_ACCESS_KEY;
  delete process.env.APP_AWS_ENDPOINT;
}

async function importStorageModule() {
  return import('./s3');
}

describe('app object storage configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    resetStorageEnv();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it('defaults bucket resolution to Google object storage env vars', async () => {
    process.env.APP_OBJECT_STORAGE_BUCKET = 'betayum-app-data';

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const storage = await importStorageModule();

    expect(storage.BUCKET_NAME).toBe('betayum-app-data');
    expect(storage.APP_AWS_QUESTIONNAIRE_UPLOAD_BUCKET).toBe('betayum-app-data');
    expect(storage.APP_AWS_KNOWLEDGE_BASE_BUCKET).toBe('betayum-app-data');
    expect(storage.APP_AWS_ORG_ASSETS_BUCKET).toBe('betayum-app-data');
    expect(storage.s3Client).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Google Cloud Storage credentials are missing'),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('reports Google Cloud Storage when only APP_OBJECT_STORAGE_BUCKET is configured', async () => {
    process.env.APP_OBJECT_STORAGE_BUCKET = 'betayum-app-data';

    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const storage = await importStorageModule();

    expect(() => storage.createStorageClient()).toThrow(
      'Google Cloud Storage credentials are missing',
    );
  });
});

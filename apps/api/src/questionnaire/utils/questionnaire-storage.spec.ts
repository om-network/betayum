jest.mock('../../app/object-storage', () => {
  const actual = jest.requireActual('../../app/object-storage') as typeof import('../../app/object-storage');

  return {
    ...actual,
    objectStorage: {
      uploadObject: jest.fn(),
    },
  };
});

jest.mock('@db', () => ({
  db: {},
  Prisma: {
    JsonNull: 'JsonNull',
  },
}));

import { objectStorage } from '../../app/object-storage';
import { uploadQuestionnaireFile } from './questionnaire-storage';

const mockObjectStorage = objectStorage as jest.Mocked<typeof objectStorage>;

describe('questionnaire object storage', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      APP_GCP_QUESTIONNAIRE_UPLOAD_BUCKET: 'betayum-questionnaires',
    };
    mockObjectStorage.uploadObject.mockResolvedValue({
      bucketName: 'betayum-questionnaires',
      key: 'org_123/questionnaire-uploads/file.pdf',
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uploads questionnaire files through object storage', async () => {
    const result = await uploadQuestionnaireFile({
      organizationId: 'org_123',
      fileName: 'Questionnaire File.pdf',
      fileType: 'application/pdf',
      fileData: Buffer.from('%PDF-1.4').toString('base64'),
      source: 'internal',
    });

    expect(result).toEqual({
      s3Key: expect.stringMatching(
        /^org_123\/questionnaire-uploads\/\d+-[a-f0-9]+-Questionnaire_File\.pdf$/,
      ),
      fileSize: 8,
    });
    expect(mockObjectStorage.uploadObject).toHaveBeenCalledWith({
      organizationId: 'org_123',
      key: expect.stringMatching(
        /^org_123\/questionnaire-uploads\/\d+-[a-f0-9]+-Questionnaire_File\.pdf$/,
      ),
      bucketName: 'betayum-questionnaires',
      body: Buffer.from('%PDF-1.4'),
      contentType: 'application/pdf',
      metadata: {
        originalFileName: 'Questionnaire_File.pdf',
        organizationId: 'org_123',
        source: 'internal',
      },
    });
  });
});

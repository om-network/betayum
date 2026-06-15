import { randomBytes } from 'crypto';
import {
  getKnowledgeBaseBucketName,
  objectStorage,
} from '@/app/object-storage';
import {
  MAX_FILE_SIZE_BYTES,
  SIGNED_URL_EXPIRATION_SECONDS,
  sanitizeFileName,
  sanitizeMetadataFileName,
  generateS3Key,
} from './constants';

export interface UploadResult {
  s3Key: string;
  fileSize: number;
}

export interface SignedUrlResult {
  signedUrl: string;
}

/**
 * Validates that Knowledge Base object storage is configured.
 */
export function validateS3Config(): void {
  if (!getKnowledgeBaseBucketName()) {
    throw new Error(
      'Knowledge base bucket is not configured.',
    );
  }
}

/**
 * Uploads a document to object storage.
 */
export async function uploadToS3(
  organizationId: string,
  fileName: string,
  fileType: string,
  fileData: string,
): Promise<UploadResult> {
  validateS3Config();

  // Convert base64 to buffer
  const fileBuffer = Buffer.from(fileData, 'base64');

  // Validate file size
  if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit`,
    );
  }

  // Generate unique file key
  const fileId = randomBytes(16).toString('hex');
  const sanitized = sanitizeFileName(fileName);
  const s3Key = generateS3Key(organizationId, fileId, sanitized);

  await objectStorage.uploadObject({
    organizationId,
    key: s3Key,
    bucketName: getKnowledgeBaseBucketName(),
    body: fileBuffer,
    contentType: fileType,
    metadata: {
      originalFileName: sanitizeMetadataFileName(fileName),
      organizationId,
    },
  });

  return {
    s3Key,
    fileSize: fileBuffer.length,
  };
}

/**
 * Generates a signed URL for downloading a document
 */
export async function generateDownloadUrl(
  s3Key: string,
  fileName: string,
): Promise<SignedUrlResult> {
  validateS3Config();

  const signedUrl = await objectStorage.getSignedObjectUrl({
    organizationId: extractOrganizationId(s3Key),
    key: s3Key,
    bucketName: getKnowledgeBaseBucketName(),
    action: 'read',
    expiresInSeconds: SIGNED_URL_EXPIRATION_SECONDS,
    responseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
  });

  return { signedUrl };
}

/**
 * Generates a signed URL for viewing a document in browser
 */
export async function generateViewUrl(
  s3Key: string,
  fileName: string,
  fileType: string,
): Promise<SignedUrlResult> {
  validateS3Config();

  const signedUrl = await objectStorage.getSignedObjectUrl({
    organizationId: extractOrganizationId(s3Key),
    key: s3Key,
    bucketName: getKnowledgeBaseBucketName(),
    action: 'read',
    expiresInSeconds: SIGNED_URL_EXPIRATION_SECONDS,
    responseContentDisposition: `inline; filename="${encodeURIComponent(fileName)}"`,
    responseContentType: fileType || 'application/octet-stream',
  });

  return { signedUrl };
}

/**
 * Deletes a document from object storage.
 * Returns true if successful, false if error (non-throwing)
 */
export async function deleteFromS3(s3Key: string): Promise<boolean> {
  try {
    validateS3Config();

    await objectStorage.deleteObject({
      organizationId: extractOrganizationId(s3Key),
      key: s3Key,
      bucketName: getKnowledgeBaseBucketName(),
    });

    return true;
  } catch {
    return false;
  }
}

function extractOrganizationId(s3Key: string): string {
  const [organizationId] = s3Key.split('/');
  if (!organizationId) {
    throw new Error('Object key must include an organization prefix');
  }

  return organizationId;
}

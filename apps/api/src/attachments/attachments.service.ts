import {
  objectStorage,
  type ObjectStorage,
} from '@/app/object-storage';
import { AttachmentEntityType, AttachmentType, db } from '@db';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AttachmentResponseDto } from '../tasks/dto/task-responses.dto';
import { UploadAttachmentDto } from './upload-attachment.dto';
import { validateFileContent } from '../utils/file-type-validation';

@Injectable()
export class AttachmentsService {
  private readonly MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
  private readonly SIGNED_URL_EXPIRY = 900; // 15 minutes

  constructor(private readonly storage: ObjectStorage = objectStorage) {}

  /**
   * Upload attachment to object storage and create database record.
   */
  async uploadAttachment(
    organizationId: string,
    entityId: string,
    entityType: AttachmentEntityType,
    uploadDto: UploadAttachmentDto,
    userId?: string,
  ): Promise<AttachmentResponseDto> {
    try {
      // Blocked file extensions for security
      const BLOCKED_EXTENSIONS = [
        'exe',
        'bat',
        'cmd',
        'com',
        'scr',
        'msi', // Windows executables
        'js',
        'vbs',
        'vbe',
        'wsf',
        'wsh',
        'ps1', // Scripts
        'sh',
        'bash',
        'zsh', // Shell scripts
        'dll',
        'sys',
        'drv', // System files
        'app',
        'deb',
        'rpm', // Application packages
        'jar', // Java archives (can execute)
        'pif',
        'lnk',
        'cpl', // Shortcuts and control panel
        'hta',
        'reg', // HTML apps and registry
      ];

      // Blocked MIME types for security
      const BLOCKED_MIME_TYPES = [
        'application/x-msdownload', // .exe
        'application/x-msdos-program',
        'application/x-executable',
        'application/x-sh', // Shell scripts
        'application/x-bat', // Batch files
        'text/x-sh',
        'text/x-python',
        'text/x-perl',
        'text/x-ruby',
        'application/x-httpd-php', // PHP files
        'application/x-javascript', // Executable JS (not JSON)
        'application/javascript',
        'text/javascript',
      ];

      // Validate file extension
      const fileExt = uploadDto.fileName.split('.').pop()?.toLowerCase();
      if (fileExt && BLOCKED_EXTENSIONS.includes(fileExt)) {
        throw new BadRequestException(
          `File extension '.${fileExt}' is not allowed for security reasons`,
        );
      }

      // Validate MIME type
      if (BLOCKED_MIME_TYPES.includes(uploadDto.fileType.toLowerCase())) {
        throw new BadRequestException(
          `File type '${uploadDto.fileType}' is not allowed for security reasons`,
        );
      }

      // Validate file size
      const fileBuffer = Buffer.from(uploadDto.fileData, 'base64');
      if (fileBuffer.length > this.MAX_FILE_SIZE_BYTES) {
        throw new BadRequestException(
          `File size exceeds maximum allowed size of ${this.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
        );
      }

      // Validate file content matches declared MIME type
      validateFileContent(fileBuffer, uploadDto.fileType, uploadDto.fileName);

      // Generate unique file key
      const fileId = randomBytes(16).toString('hex');
      const sanitizedFileName = this.sanitizeFileName(uploadDto.fileName);
      const timestamp = Date.now();

      let objectKey: string;
      if (entityType === 'task_item') {
        // For task items, extract entityType and entityId from metadata
        // Metadata should contain taskItemEntityType and taskItemEntityId
        const taskItemEntityType =
          uploadDto.description?.split('|')[0] || 'unknown';
        const taskItemEntityId =
          uploadDto.description?.split('|')[1] || entityId;
        objectKey = `${organizationId}/attachments/task-item/${taskItemEntityType}/${taskItemEntityId}/${timestamp}-${fileId}-${sanitizedFileName}`;
      } else {
        objectKey = `${organizationId}/attachments/${entityType}/${entityId}/${timestamp}-${fileId}-${sanitizedFileName}`;
      }

      await this.storage.uploadObject({
        organizationId,
        key: objectKey,
        body: fileBuffer,
        contentType: uploadDto.fileType,
      });

      // Create database record
      const attachment = await db.attachment.create({
        data: {
          name: uploadDto.fileName,
          url: objectKey,
          type: this.mapFileTypeToAttachmentType(uploadDto.fileType),
          entityId,
          entityType,
          organizationId,
        },
      });

      // Generate signed URL for immediate access
      const downloadUrl = await this.generateSignedUrl({
        organizationId,
        objectKey,
      });

      return {
        id: attachment.id,
        name: attachment.name,
        type: attachment.type,
        downloadUrl,
        createdAt: attachment.createdAt,
        size: fileBuffer.length,
      };
    } catch (error) {
      console.error('Error uploading attachment:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to upload attachment');
    }
  }

  /**
   * Get all attachments for an entity WITH signed URLs (for backward compatibility)
   */
  async getAttachments(
    organizationId: string,
    entityId: string,
    entityType: AttachmentEntityType,
  ): Promise<AttachmentResponseDto[]> {
    const attachments = await db.attachment.findMany({
      where: {
        organizationId,
        entityId,
        entityType,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Generate signed URLs for all attachments
    const attachmentsWithUrls = await Promise.all(
      attachments.map(async (attachment) => {
        const downloadUrl = await this.generateSignedUrl({
          organizationId,
          objectKey: attachment.url,
        });
        return {
          id: attachment.id,
          name: attachment.name,
          type: attachment.type,
          downloadUrl,
          createdAt: attachment.createdAt,
        };
      }),
    );

    return attachmentsWithUrls;
  }

  /**
   * Get attachment metadata WITHOUT signed URLs (for on-demand URL generation)
   */
  async getAttachmentMetadata(
    organizationId: string,
    entityId: string,
    entityType: AttachmentEntityType,
  ): Promise<{ id: string; name: string; type: string; createdAt: Date }[]> {
    const attachments = await db.attachment.findMany({
      where: {
        organizationId,
        entityId,
        entityType,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      createdAt: attachment.createdAt,
    }));
  }

  /**
   * Get download URL for an attachment
   */
  async getAttachmentDownloadUrl(
    organizationId: string,
    attachmentId: string,
  ): Promise<{ downloadUrl: string; expiresIn: number }> {
    try {
      // Get attachment record
      const attachment = await db.attachment.findFirst({
        where: {
          id: attachmentId,
          organizationId,
        },
      });

      if (!attachment) {
        throw new BadRequestException('Attachment not found');
      }

      // Generate signed URL
      const downloadUrl = await this.generateSignedUrl({
        organizationId,
        objectKey: attachment.url,
      });

      return {
        downloadUrl,
        expiresIn: this.SIGNED_URL_EXPIRY,
      };
    } catch (error) {
      console.error('Error generating download URL:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to generate download URL');
    }
  }

  /**
   * Get attachment by ID
   */
  async getAttachmentById(organizationId: string, attachmentId: string) {
    return db.attachment.findFirst({
      where: { id: attachmentId, organizationId },
      select: { id: true, name: true, type: true },
    });
  }

  /**
   * Delete attachment from object storage and database.
   */
  async deleteAttachment(
    organizationId: string,
    attachmentId: string,
  ): Promise<void> {
    try {
      // Get attachment record
      const attachment = await db.attachment.findFirst({
        where: {
          id: attachmentId,
          organizationId,
        },
      });

      if (!attachment) {
        throw new BadRequestException('Attachment not found');
      }

      await this.storage.deleteObject({
        organizationId,
        key: attachment.url,
      });

      // Delete from database
      await db.attachment.delete({
        where: {
          id: attachmentId,
          organizationId,
        },
      });
    } catch (error) {
      console.error('Error deleting attachment:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to delete attachment');
    }
  }

  /**
   * Copy a policy PDF to a new object key for versioning.
   */
  async copyPolicyVersionPdf(
    sourceKey: string,
    destinationKey: string,
  ): Promise<string | null> {
    try {
      await this.storage.copyObject({
        organizationId: this.extractOrganizationId(sourceKey),
        sourceKey,
        destinationKey,
      });

      return destinationKey;
    } catch (error) {
      console.error('Error copying policy PDF:', error);
      return null;
    }
  }

  /**
   * Delete a policy version PDF from object storage.
   */
  async deletePolicyVersionPdf(objectKey: string): Promise<void> {
    try {
      await this.storage.deleteObject({
        organizationId: this.extractOrganizationId(objectKey),
        key: objectKey,
      });
    } catch (error) {
      console.error('Error deleting policy PDF:', error);
    }
  }

  /**
   * Generate signed URL for file download
   */
  private async generateSignedUrl({
    organizationId,
    objectKey,
  }: {
    organizationId: string;
    objectKey: string;
  }): Promise<string> {
    return this.storage.getSignedObjectUrl({
      organizationId,
      key: objectKey,
      action: 'read',
      expiresInSeconds: this.SIGNED_URL_EXPIRY,
    });
  }

  async uploadToS3(
    fileBuffer: Buffer,
    fileName: string,
    contentType: string,
    organizationId: string,
    entityType: string,
    entityId: string,
  ): Promise<string> {
    const fileId = randomBytes(16).toString('hex');
    const sanitizedFileName = this.sanitizeFileName(fileName);
    const timestamp = Date.now();
    const objectKey = `${organizationId}/attachments/${entityType}/${entityId}/${timestamp}-${fileId}-${sanitizedFileName}`;

    const location = await this.storage.uploadObject({
      organizationId,
      key: objectKey,
      body: fileBuffer,
      contentType,
    });

    return location.key;
  }

  async getPresignedDownloadUrl(objectKey: string): Promise<string> {
    return this.generateSignedUrl({
      organizationId: this.extractOrganizationId(objectKey),
      objectKey,
    });
  }

  /**
   * Generate presigned download URL with a custom download filename
   */
  async getPresignedDownloadUrlWithFilename(
    objectKey: string,
    downloadFilename: string,
  ): Promise<string> {
    const sanitizedFilename = this.sanitizeHeaderValue(downloadFilename);
    return this.storage.getSignedObjectUrl({
      organizationId: this.extractOrganizationId(objectKey),
      key: objectKey,
      action: 'read',
      expiresInSeconds: this.SIGNED_URL_EXPIRY,
      responseContentDisposition: `attachment; filename="${sanitizedFilename}"`,
    });
  }

  /**
   * Generate a presigned URL for viewing a PDF inline in the browser
   */
  async getPresignedInlinePdfUrl(objectKey: string): Promise<string> {
    return this.storage.getSignedObjectUrl({
      organizationId: this.extractOrganizationId(objectKey),
      key: objectKey,
      action: 'read',
      expiresInSeconds: this.SIGNED_URL_EXPIRY,
      responseContentDisposition: 'inline',
      responseContentType: 'application/pdf',
    });
  }

  /**
   * Upload a buffer to object storage with a specific key.
   */
  async uploadBuffer(
    objectKey: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.storage.uploadObject({
      organizationId: this.extractOrganizationId(objectKey),
      key: objectKey,
      body: buffer,
      contentType,
    });
  }

  async getObjectBuffer(objectKey: string): Promise<Buffer> {
    const stream = this.storage.streamObject({
      organizationId: this.extractOrganizationId(objectKey),
      key: objectKey,
    });
    const chunks: Uint8Array[] = [];

    for await (const chunk of stream) {
      chunks.push(this.toUint8Array(chunk));
    }

    return Buffer.concat(chunks);
  }

  private extractOrganizationId(objectKey: string): string {
    const [organizationId] = objectKey.split('/');

    if (!organizationId) {
      throw new InternalServerErrorException(
        'Object key is missing organization prefix',
      );
    }

    return organizationId;
  }

  private toUint8Array(chunk: unknown): Uint8Array {
    if (chunk instanceof Uint8Array) {
      return chunk;
    }

    if (typeof chunk === 'string') {
      return Buffer.from(chunk);
    }

    throw new InternalServerErrorException(
      'Unsupported object storage stream chunk',
    );
  }

  private sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  }

  /**
   * Sanitize header value for S3 user metadata (x-amz-meta-*) to avoid invalid characters
   * - Remove control characters (\x00-\x1F, \x7F)
   * - Replace non-ASCII with '_'
   * - Trim whitespace
   */
  private sanitizeHeaderValue(value: string): string {
    // eslint-disable-next-line no-control-regex
    const withoutControls = value.replace(/[\x00-\x1F\x7F]/g, '');
    const asciiOnly = withoutControls.replace(/[^\x20-\x7E]/g, '_');
    return asciiOnly.trim();
  }

  /**
   * Map MIME type to AttachmentType enum
   */
  private mapFileTypeToAttachmentType(fileType: string): AttachmentType {
    const type = fileType.split('/')[0];
    switch (type) {
      case 'image':
        return AttachmentType.image;
      case 'video':
        return AttachmentType.video;
      case 'audio':
        return AttachmentType.audio;
      case 'application':
      case 'text':
        return AttachmentType.document;
      default:
        return AttachmentType.other;
    }
  }
}

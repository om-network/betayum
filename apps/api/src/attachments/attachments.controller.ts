import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { AttachmentsService } from './attachments.service';

@ApiTags('Attachments')
@Controller({ path: 'attachments', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get(':attachmentId/download')
  @RequirePermission('evidence', 'read')
  @ApiOperation({
    summary: 'Get attachment download URL',
    description: 'Generate a fresh signed URL for downloading any attachment',
  })
  @ApiParam({
    name: 'attachmentId',
    description: 'Unique attachment identifier',
    example: 'att_abc123def456',
  })
  @ApiResponse({
    status: 200,
    description: 'Download URL generated successfully',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            downloadUrl: {
              type: 'string',
              description: 'Signed URL for downloading the file',
              example:
                'https://bucket.s3.amazonaws.com/path/to/file.pdf?signature=...',
            },
            expiresIn: {
              type: 'number',
              description: 'URL expiration time in seconds',
              example: 900,
            },
          },
        },
      },
    },
  })
  async getAttachmentDownloadUrl(
    @OrganizationId() organizationId: string,
    @Param('attachmentId') attachmentId: string,
  ): Promise<{ downloadUrl: string; expiresIn: number }> {
    return await this.attachmentsService.getAttachmentDownloadUrl(
      organizationId,
      attachmentId,
    );
  }

  @Get(':attachmentId/stream')
  @RequirePermission('evidence', 'read')
  async streamAttachment(
    @OrganizationId() organizationId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, contentType, fileName } =
      await this.attachmentsService.streamAttachmentContent(
        organizationId,
        attachmentId,
      );
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName.replace(/"/g, '_')}"`,
    );
    stream.pipe(res);
  }
}

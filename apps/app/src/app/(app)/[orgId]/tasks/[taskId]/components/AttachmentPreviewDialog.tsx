'use client';

import { api } from '@/lib/api-client';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@trycompai/design-system';
import { Download } from '@trycompai/design-system/icons';
import { useEffect, useState } from 'react';

interface PreviewAttachment {
  id: string;
  name: string;
}

interface AttachmentPreviewDialogProps {
  attachment: PreviewAttachment | null;
  onClose: () => void;
  onDownload: (attachmentId: string) => void;
  isDownloading?: boolean;
}

type PreviewKind = 'audio' | 'image' | 'pdf' | 'text' | 'unsupported' | 'video';

interface PreviewState {
  error?: string;
  isLoading: boolean;
  isTruncated?: boolean;
  text?: string;
  url?: string;
}

const MAX_TEXT_PREVIEW_BYTES = 1024 * 1024;

function getExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function getPreviewKind(fileName: string): PreviewKind {
  const extension = getExtension(fileName);

  if (['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'webp'].includes(extension)) {
    return 'image';
  }
  if (extension === 'pdf') return 'pdf';
  if (['csv', 'json', 'log', 'md', 'txt', 'xml', 'yaml', 'yml'].includes(extension)) {
    return 'text';
  }
  if (['mp4', 'webm'].includes(extension)) return 'video';
  if (['mp3', 'ogg', 'wav'].includes(extension)) return 'audio';

  return 'unsupported';
}

export function AttachmentPreviewDialog({
  attachment,
  onClose,
  onDownload,
  isDownloading = false,
}: AttachmentPreviewDialogProps) {
  const [preview, setPreview] = useState<PreviewState>({ isLoading: false });
  const previewKind = attachment ? getPreviewKind(attachment.name) : 'unsupported';

  useEffect(() => {
    if (!attachment || previewKind === 'unsupported') {
      setPreview({ isLoading: false });
      return;
    }

    let isCancelled = false;
    let objectUrl: string | undefined;

    const loadPreview = async () => {
      setPreview({ isLoading: true });

      try {
        const response = await api.raw(`/v1/attachments/${attachment.id}/stream`);
        if (!response.ok) {
          throw new Error(`Preview request failed with status ${response.status}`);
        }

        const blob = await response.blob();
        if (previewKind === 'text') {
          const previewBlob = blob.slice(0, MAX_TEXT_PREVIEW_BYTES);
          const text = await previewBlob.text();
          if (!isCancelled) {
            setPreview({
              isLoading: false,
              isTruncated: blob.size > MAX_TEXT_PREVIEW_BYTES,
              text,
            });
          }
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        if (isCancelled) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = undefined;
          return;
        }
        setPreview({ isLoading: false, url: objectUrl });
      } catch (error) {
        if (!isCancelled) {
          setPreview({
            error: error instanceof Error ? error.message : 'Failed to load attachment preview.',
            isLoading: false,
          });
        }
      }
    };

    void loadPreview();

    return () => {
      isCancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment, previewKind]);

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const handleDownload = () => {
    if (attachment) onDownload(attachment.id);
  };

  return (
    <Dialog open={attachment !== null} onOpenChange={handleOpenChange}>
      <DialogContent size="4xl" padding="none">
        <div className="border-b p-4 pr-12">
          <DialogHeader>
            <DialogTitle>{attachment?.name ?? 'Attachment preview'}</DialogTitle>
            <DialogDescription>Previewing the submitted task attachment.</DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex h-[70vh] items-center justify-center overflow-auto bg-muted/30 p-4">
          {preview.isLoading && <p role="status">Loading preview…</p>}
          {preview.error && (
            <p className="text-destructive">The attachment preview could not be loaded.</p>
          )}
          {!preview.isLoading && !preview.error && previewKind === 'unsupported' && (
            <p className="text-muted-foreground">
              A browser preview is not available for this file type.
            </p>
          )}
          {!preview.isLoading && preview.url && previewKind === 'image' && (
            // Blob URLs cannot use the Next.js image optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={attachment?.name ?? 'Attachment'}
              className="max-h-full max-w-full object-contain"
              src={preview.url}
            />
          )}
          {!preview.isLoading && preview.url && previewKind === 'pdf' && (
            <iframe
              className="h-full w-full rounded-md border bg-background"
              src={preview.url}
              title={attachment?.name ?? 'PDF attachment'}
            />
          )}
          {!preview.isLoading && preview.url && previewKind === 'video' && (
            <video className="max-h-full max-w-full" controls src={preview.url}>
              <track kind="captions" />
            </video>
          )}
          {!preview.isLoading && preview.url && previewKind === 'audio' && (
            <audio controls src={preview.url}>
              <track kind="captions" />
            </audio>
          )}
          {!preview.isLoading && preview.text !== undefined && (
            <div className="h-full w-full overflow-auto rounded-md border bg-background p-4">
              <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                {preview.text}
              </pre>
              {preview.isTruncated && (
                <p className="mt-4 text-muted-foreground text-xs">
                  Preview truncated after 1 MB. Download the file to view the remaining content.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            iconLeft={<Download size={16} />}
            loading={isDownloading}
            onClick={handleDownload}
          >
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

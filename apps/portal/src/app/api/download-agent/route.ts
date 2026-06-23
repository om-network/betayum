import { logger } from '@/utils/logger';
import { BUCKET_NAME, getPresignedDownloadUrl, s3Client } from '@/utils/s3';
import { client as kv } from '@trycompai/kv';
import { type NextRequest, NextResponse } from 'next/server';

import { DOWNLOAD_TARGETS } from './constants';
import type { SupportedOS } from './types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface DownloadTokenInfo {
  orgId: string;
  employeeId: string;
  userId: string;
  os: SupportedOS;
  createdAt: number;
}

const getDownloadToken = async (token: string): Promise<DownloadTokenInfo | null> => {
  const info = await kv.get<DownloadTokenInfo>(`download:${token}`);
  return info ?? null;
};

const ensureBucket = (): string | null => {
  const bucket = process.env.FLEET_AGENT_BUCKET_NAME?.trim() || BUCKET_NAME;
  return bucket ?? null;
};

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');

  if (!token) {
    return new NextResponse('Missing download token', { status: 400 });
  }

  const downloadInfo = await getDownloadToken(token);

  if (!downloadInfo) {
    return new NextResponse('Invalid or expired download token', { status: 403 });
  }

  const fleetBucketName = ensureBucket();

  if (!fleetBucketName) {
    logger('Device agent download misconfigured: missing bucket');
    return new NextResponse('Server configuration error', { status: 500 });
  }

  if (!s3Client) {
    logger('Device agent download misconfigured: object storage client unavailable');
    return new NextResponse('Server configuration error', { status: 500 });
  }

  const target = DOWNLOAD_TARGETS[downloadInfo.os];
  if (!target) {
    return new NextResponse('Unsupported OS', { status: 400 });
  }

  try {
    // Generate a short-lived signed URL and redirect the client directly to GCS.
    // This avoids proxying large binaries through the Next.js server (Cloud Run
    // has a 32 MB response size limit that DMG/EXE files exceed).
    const signedUrl = await getPresignedDownloadUrl({
      bucketName: fleetBucketName,
      key: target.key,
      expiresIn: 300, // 5 minutes — enough time to start the download
    });

    // Consume the token so it can't be reused
    await kv.del(`download:${token}`);

    return NextResponse.redirect(signedUrl, { status: 302 });
  } catch (error) {
    logger('Error generating device agent download URL', {
      error,
      token,
      os: downloadInfo.os,
    });

    return new NextResponse('Failed to generate download link', { status: 500 });
  }
}

export async function HEAD(req: NextRequest) {
  // HEAD just validates the token — no redirect needed
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return new NextResponse(null, { status: 400 });

  const downloadInfo = await getDownloadToken(token);
  if (!downloadInfo) return new NextResponse(null, { status: 403 });

  return new NextResponse(null, { status: 200 });
}

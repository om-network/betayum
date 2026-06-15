function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function getString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const field = value[key];
  return typeof field === 'string' ? field : undefined;
}

function getStorageErrorCode(
  error: Record<string, unknown>,
): string | undefined {
  return getString(error, 'name') ?? getString(error, 'Code');
}

function getStorageErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return isRecord(error) ? (getString(error, 'message') ?? '') : '';
}

export function isMissingObjectError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const code = getStorageErrorCode(error);
  if (code === 'NoSuchKey') {
    return true;
  }

  const message = getStorageErrorMessage(error).toLowerCase();
  if (code === 'NotFound') {
    return !message.includes('bucket');
  }

  return (
    message.includes('no such object') ||
    message.includes('object not found') ||
    message.includes('the specified key does not exist')
  );
}

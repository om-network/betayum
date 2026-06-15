function isKnownObjectStorageHostname(hostname: string): boolean {
  const lowerHostname = hostname.toLowerCase();

  return (
    lowerHostname === 'storage.googleapis.com' ||
    lowerHostname.endsWith('.storage.googleapis.com') ||
    lowerHostname === 'amazonaws.com' ||
    lowerHostname.endsWith('.amazonaws.com')
  );
}

function getAbsoluteUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function getLeadingHostname(value: string): string | undefined {
  const [firstSegment] = value.split(/[/?#]/);
  if (!firstSegment || !firstSegment.includes('.')) {
    return undefined;
  }

  const url = getAbsoluteUrl(`https://${firstSegment}`);
  return url?.hostname;
}

export function validateObjectKey(key: string): string {
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new Error('Object key cannot be empty');
  }

  const normalizedKey = key.trim().replace(/^\/+/, '');
  const absoluteUrl = getAbsoluteUrl(normalizedKey);

  if (absoluteUrl) {
    throw new Error('Object key must not be a URL');
  }

  const leadingHostname = getLeadingHostname(normalizedKey);
  if (leadingHostname && isKnownObjectStorageHostname(leadingHostname)) {
    throw new Error('Object key must not be a URL');
  }

  const segments = normalizedKey.split('/');
  if (segments.some((segment) => segment === '..')) {
    throw new Error('Path traversal detected in object key');
  }

  return normalizedKey;
}

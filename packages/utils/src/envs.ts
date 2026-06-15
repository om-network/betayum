export function getAppUrl() {
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    return 'https://app.betayum.com';
  }

  if (process.env.VERCEL_ENV === 'preview') {
    return `https://${process.env.VERCEL_URL}`;
  }

  return 'http://localhost:3000';
}

export function getEmailUrl() {
  return 'https://betayum.com';
}

export function getWebsiteUrl() {
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    return 'https://betayum.com';
  }

  if (process.env.VERCEL_ENV === 'preview') {
    return `https://${process.env.VERCEL_URL}`;
  }

  return 'http://localhost:3000';
}

export function getCdnUrl() {
  return 'https://cdn.betayum.com';
}

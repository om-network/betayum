const apiBase = new URL(process.env.NGROK_PROXY_API_BASE ?? 'http://127.0.0.1:3333');
const portalBase = new URL(
  process.env.NGROK_PROXY_PORTAL_BASE ?? 'http://127.0.0.1:3002',
);

type ProxySocketData = {
  targetUrl: string;
  upstream?: WebSocket;
};

type ClosableSocket = {
  close(code?: number, reason?: string): void;
};

function pickTarget(pathname: string): URL {
  if (pathname.startsWith('/api') || pathname.startsWith('/v1')) {
    return apiBase;
  }

  return portalBase;
}

const server = Bun.serve<ProxySocketData>({
  port: Number(process.env.NGROK_PROXY_PORT || 0),
  idleTimeout: 255,
  fetch(request, server) {
    const incomingUrl = new URL(request.url);
    const targetBase = pickTarget(incomingUrl.pathname);
    const targetUrl = new URL(
      `${incomingUrl.pathname}${incomingUrl.search}`,
      targetBase,
    );

    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      if (
        server.upgrade(request, {
          data: {
            targetUrl: toWebSocketUrl(targetUrl).toString(),
          } satisfies ProxySocketData,
        })
      ) {
        return;
      }

      return new Response('websocket upgrade failed', { status: 502 });
    }

    return proxyHttpRequest({ request, targetUrl, incomingUrl });
  },
  websocket: {
    open(client) {
      const data = client.data as ProxySocketData;
      const upstreamUrl = data.targetUrl;
      const upstream = new WebSocket(upstreamUrl);

      data.upstream = upstream;

      upstream.binaryType = 'arraybuffer';

      upstream.onopen = () => {
        console.log(`websocket connected: ${upstreamUrl}`);
      };

      upstream.onmessage = (event) => {
        if (typeof event.data === 'string') {
          client.send(event.data);
          return;
        }

        client.send(event.data);
      };

      upstream.onclose = (event) => {
        closeSocket(client, event.code, event.reason);
      };

      upstream.onerror = (event) => {
        console.error('upstream websocket error', event);
        client.close(1011, 'upstream websocket error');
      };
    },
    message(client, message) {
      const upstream = (client.data as ProxySocketData).upstream;
      if (!upstream || upstream.readyState !== WebSocket.OPEN) {
        return;
      }

      upstream.send(message);
    },
    close(client, code, reason) {
      const upstream = (client.data as ProxySocketData).upstream;
      if (!upstream) {
        return;
      }

      if (
        upstream.readyState === WebSocket.OPEN ||
        upstream.readyState === WebSocket.CONNECTING
      ) {
        closeSocket(upstream, code, reason);
      }
    },
  },
  error(error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`proxy error: ${message}`, { status: 502 });
  },
});

function toWebSocketUrl(targetUrl: URL): URL {
  const protocol = targetUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return new URL(`${protocol}//${targetUrl.host}${targetUrl.pathname}${targetUrl.search}`);
}

function closeSocket(
  socket: ClosableSocket,
  code?: number,
  reason?: string,
) {
  const validCode = getSafeCloseCode(code);
  if (validCode === undefined) {
    socket.close();
    return;
  }

  socket.close(validCode, reason);
}

function getSafeCloseCode(code?: number): number | undefined {
  if (code === undefined) {
    return undefined;
  }

  if (code === 1000) {
    return code;
  }

  if (code >= 3000 && code <= 4999) {
    return code;
  }

  if (code >= 1001 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) {
    return code;
  }

  return 1000;
}

async function proxyHttpRequest({
  request,
  targetUrl,
  incomingUrl,
}: {
  request: Request;
  targetUrl: URL;
  incomingUrl: URL;
}) {
  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.set('host', incomingUrl.host);
  upstreamHeaders.set('accept-encoding', 'identity');
  upstreamHeaders.set('x-forwarded-host', incomingUrl.host);
  upstreamHeaders.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''));
  upstreamHeaders.set('x-forwarded-port', incomingUrl.port || (incomingUrl.protocol === 'https:' ? '443' : '80'));

  await logAuthSignInRequest({
    request,
    requestPathname: incomingUrl.pathname,
  });

  const upstreamResponse = await fetch(targetUrl, {
    method: request.method,
    headers: upstreamHeaders,
    body:
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : request.body,
    redirect: 'manual',
  });

  logAuthCallbackResponse({
    requestPathname: incomingUrl.pathname,
    responseStatus: upstreamResponse.status,
    responseHeaders: upstreamResponse.headers,
  });

  const responseHeaders = copyResponseHeaders(upstreamResponse.headers);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

function copyResponseHeaders(sourceHeaders: Headers): Headers {
  const responseHeaders = new Headers(sourceHeaders);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  responseHeaders.delete('set-cookie');

  for (const cookie of getSetCookieHeaders(sourceHeaders)) {
    responseHeaders.append('set-cookie', cookie);
  }

  return responseHeaders;
}

function getSetCookieHeaders(headers: Headers): string[] {
  if ('getSetCookie' in headers && typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }

  const combinedCookieHeader = headers.get('set-cookie');
  return combinedCookieHeader ? [combinedCookieHeader] : [];
}

function logAuthCallbackResponse({
  requestPathname,
  responseStatus,
  responseHeaders,
}: {
  requestPathname: string;
  responseStatus: number;
  responseHeaders: Headers;
}) {
  if (!requestPathname.startsWith('/api/auth/callback/')) {
    return;
  }

  const cookieNames = getSetCookieHeaders(responseHeaders).map((cookie) =>
    cookie.split('=')[0] ?? 'unknown',
  );
  const location = responseHeaders.get('location');

  console.log(
    '[proxy] auth callback response',
    JSON.stringify({
      requestPathname,
      responseStatus,
      cookieNames,
      location,
    }),
  );
}

async function logAuthSignInRequest({
  request,
  requestPathname,
}: {
  request: Request;
  requestPathname: string;
}) {
  if (requestPathname !== '/api/auth/sign-in/social') {
    return;
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    console.log(
      '[proxy] auth sign-in request',
      JSON.stringify({
        requestPathname,
        contentType,
        callbackURL: null,
      }),
    );
    return;
  }

  try {
    const body = await request.clone().json();
    const callbackURL =
      body && typeof body === 'object' && 'callbackURL' in body
        ? body.callbackURL
        : null;

    console.log(
      '[proxy] auth sign-in request',
      JSON.stringify({
        requestPathname,
        contentType,
        callbackURL,
      }),
    );
  } catch (error) {
    console.error('[proxy] failed to parse auth sign-in request', error);
  }
}

console.log(`reverse proxy listening on http://127.0.0.1:${server.port}`);

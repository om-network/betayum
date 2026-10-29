import type { FindingAttackPath, FindingEvidence } from '@/lib/security/pentest-finding-types';

export function FindingEvidencePanel({ evidence }: { evidence?: FindingEvidence[] | null }) {
  if (!evidence?.length) return <p>No evidence recorded for this finding.</p>;
  return (
    <div className="space-y-6">
      {evidence.map((item, index) => (
        <section key={index} className="space-y-3 rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium">{item.annotation || `Evidence ${index + 1}`}</h3>
          {item.type === 'http' && (
            <>
              <p className="break-all font-mono text-xs">
                {item.method} {item.url} — HTTP {item.responseStatus}
              </p>
              <EvidenceText label="Request headers" value={formatHeaders(item.requestHeaders)} />
              <EvidenceText label="Request body" value={item.requestBody} />
              <EvidenceText label="Response headers" value={formatHeaders(item.responseHeaders)} />
              <EvidenceText label="Response body" value={item.responseBody} />
            </>
          )}
          {item.type === 'code' && (
            <>
              <p className="break-all font-mono text-xs">
                {item.filePath}:{item.startLine}–{item.endLine}
              </p>
              <EvidenceText label="Code" value={item.snippet} />
            </>
          )}
          {item.type === 'screenshot' &&
            (safeScreenshotUrl(item.screenshotUrl) ? (
              <a
                href={safeScreenshotUrl(item.screenshotUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline"
              >
                Open screenshot
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">Screenshot unavailable.</p>
            ))}
        </section>
      ))}
    </div>
  );
}

export function FindingAttackPathPanel({ attackPath }: { attackPath?: FindingAttackPath | null }) {
  if (!attackPath) return <p>No attack path recorded for this finding.</p>;
  return (
    <div className="space-y-4 text-sm">
      <p className="whitespace-pre-wrap">{attackPath.description}</p>
      <EvidenceText label="Attack path" value={attackPath.path} />
      <h3 className="font-medium">Likelihood: {attackPath.likelihood}</h3>
      <p>{attackPath.likelihoodRationale}</p>
      <h3 className="font-medium">Impact: {attackPath.impact}</h3>
      <p>{attackPath.impactRationale}</p>
      <FindingList label="Assumptions" items={attackPath.assumptions} />
      <FindingList label="Controls" items={attackPath.controls} />
      <FindingList label="Blind spots" items={attackPath.blindspots} />
    </div>
  );
}

function EvidenceText({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <h4 className="mb-1 text-xs font-medium">{label}</h4>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded border border-border bg-muted/50 p-3 text-xs">
        {value}
      </pre>
    </div>
  );
}

function FindingList({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="font-medium">{label}</h3>
      <ul className="list-disc space-y-1 pl-5">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function formatHeaders(headers?: Record<string, string>) {
  return headers
    ? Object.entries(headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')
    : undefined;
}

function safeScreenshotUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

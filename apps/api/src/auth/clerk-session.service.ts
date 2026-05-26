import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { getClerkAuthConfig } from './clerk-auth.config';

export type VerifiedClerkSession = {
  clerkUserId: string;
  sessionId: string;
  organizationId?: string;
  impersonatedBy?: string;
};

@Injectable()
export class ClerkSessionService {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  async verifyRequest(headers: {
    authorization?: string;
    cookie?: string;
  }): Promise<VerifiedClerkSession> {
    const token = this.extractSessionToken(headers);

    if (!token) {
      throw new UnauthorizedException(
        'Authentication required: Provide a Clerk session token.',
      );
    }

    const { issuer, authorizedParties } = getClerkAuthConfig();

    try {
      const { payload } = await jwtVerify(token, this.getJwks(), {
        issuer,
      });

      this.assertAuthorizedParty({ payload, authorizedParties });

      return this.toVerifiedSession(payload);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid or expired Clerk session.');
    }
  }

  private extractSessionToken(headers: {
    authorization?: string;
    cookie?: string;
  }): string | null {
    const authHeader = headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length).trim();
    }

    return this.extractCookie({
      cookieHeader: headers.cookie,
      name: '__session',
    });
  }

  private extractCookie({
    cookieHeader,
    name,
  }: {
    cookieHeader?: string;
    name: string;
  }): string | null {
    if (!cookieHeader) {
      return null;
    }

    for (const segment of cookieHeader.split(';')) {
      const [rawName, ...rawValueParts] = segment.trim().split('=');
      if (rawName !== name) {
        continue;
      }

      return this.decodeCookieValue(rawValueParts.join('='));
    }

    return null;
  }

  private getJwks(): ReturnType<typeof createRemoteJWKSet> {
    if (!this.jwks) {
      const { jwksUrl } = getClerkAuthConfig();
      this.jwks = createRemoteJWKSet(new URL(jwksUrl));
    }

    return this.jwks;
  }

  private decodeCookieValue(value: string): string | null {
    if (!value) {
      return null;
    }

    try {
      return decodeURIComponent(value);
    } catch {
      throw new UnauthorizedException('Invalid Clerk session cookie.');
    }
  }

  private assertAuthorizedParty({
    payload,
    authorizedParties,
  }: {
    payload: JWTPayload;
    authorizedParties: string[];
  }): void {
    const azp = this.getStringClaim({ payload, key: 'azp' });
    if (azp && !authorizedParties.includes(azp)) {
      throw new UnauthorizedException('Clerk session is not from a trusted app.');
    }
  }

  private toVerifiedSession(payload: JWTPayload): VerifiedClerkSession {
    const clerkUserId = payload.sub;
    const sessionId = this.getStringClaim({ payload, key: 'sid' });

    if (!clerkUserId || !sessionId) {
      throw new UnauthorizedException('Clerk session is missing required claims.');
    }

    return {
      clerkUserId,
      sessionId,
      organizationId: this.getStringClaim({ payload, key: 'org_id' }) ?? undefined,
      impersonatedBy: this.getActorUserId(payload),
    };
  }

  private getStringClaim({
    payload,
    key,
  }: {
    payload: JWTPayload;
    key: string;
  }): string | null {
    const value = payload[key];
    return typeof value === 'string' && value ? value : null;
  }

  private getActorUserId(payload: JWTPayload): string | undefined {
    const actor = payload.act;
    if (!actor || typeof actor !== 'object' || Array.isArray(actor)) {
      return undefined;
    }

    const maybeActor = actor as Record<string, unknown>;
    return typeof maybeActor.sub === 'string' ? maybeActor.sub : undefined;
  }
}

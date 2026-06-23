'use client';

import { GithubSignIn } from '@/components/github-sign-in';
import { GoogleSignIn } from '@/components/google-sign-in';
import { MagicLinkSignIn } from '@/components/magic-link';
import { MicrosoftSignIn } from '@/components/microsoft-sign-in';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@trycompai/design-system';
import {
  CheckmarkOutline,
  ChevronDown,
  ChevronUp,
} from '@trycompai/design-system/icons';
import { useState } from 'react';

interface LoginFormProps {
  inviteCode?: string;
  redirectTo?: string;
  showGoogle: boolean;
  showGithub: boolean;
  showMicrosoft: boolean;
}

export function LoginForm({
  inviteCode,
  redirectTo,
  showGoogle: _showGoogle,
  showGithub,
  showMicrosoft: _showMicrosoft,
}: LoginFormProps) {
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [magicLinkState, setMagicLinkState] = useState({ sent: false, email: '' });

  const handleMagicLinkSent = (email: string) => {
    setMagicLinkState({ sent: true, email });
  };

  if (magicLinkState.sent) {
    return (
      <Card width="full" maxWidth="md">
        <CardContent>
          <div className="flex flex-col items-center justify-center space-y-6 px-2 py-12 text-center">
            <CheckmarkOutline className="h-16 w-16 text-primary" />
            <div className="space-y-2">
              <CardTitle>Magic link sent</CardTitle>
              <CardDescription>
                Check your inbox at{' '}
                <span className="font-semibold text-foreground">
                  {magicLinkState.email}
                </span>{' '}
                for a magic link to sign in.
              </CardDescription>
            </div>
            <Button variant="link" onClick={() => setMagicLinkState({ sent: false, email: '' })}>
              Use another method
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // OAuth provider availability is determined by the API auth server, not by
  // per-app provider secrets in apps/app.
  const preferredSignInOptions = [
    <GoogleSignIn key="google" inviteCode={inviteCode} redirectTo={redirectTo} />,
    <MicrosoftSignIn
      key="microsoft-primary"
      inviteCode={inviteCode}
      redirectTo={redirectTo}
    />,
  ];

  const moreOptionsList = [
    <MagicLinkSignIn
      key="magic-link"
      inviteCode={inviteCode}
      redirectTo={redirectTo}
      onMagicLinkSubmit={handleMagicLinkSent}
    />,
  ];

  if (showGithub) {
    moreOptionsList.push(
      <GithubSignIn key="github" inviteCode={inviteCode} redirectTo={redirectTo} />,
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">{preferredSignInOptions}</div>

      {moreOptionsList.length > 0 && (
        <Collapsible open={isOptionsOpen} onOpenChange={setIsOptionsOpen}>
          <div className="relative flex items-center justify-center py-2">
            <div className="absolute inset-x-0 top-1/2 flex items-center">
              <span className="w-full border-t" />
            </div>
            <CollapsibleTrigger className="relative inline-flex items-center gap-1 rounded-md border border-border bg-background px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              More options
              {isOptionsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent className="space-y-4 pt-4 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2">
            {moreOptionsList}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

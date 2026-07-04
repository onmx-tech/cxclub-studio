'use client';

/**
 * Devtools Layout
 *
 * Requires authentication for all /ycode/devtools/* pages.
 * Redirects to /ycode (login screen) if not authenticated.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthSession } from '@/hooks/use-auth-session';
import BuilderLoading from '@/components/BuilderLoading';
// CX: devtools flag — this route has no nav entry point, but it's reachable
// by direct URL, so gate it with a cheap redirect when the flag is off.
import { CX_FEATURES_SETTING_KEY, resolveCxFeatures } from '@/lib/cx-features';

export default function DevtoolsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, isLoading } = useAuthSession();
  const [devtoolsAllowed, setDevtoolsAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isLoading && !session) {
      router.push('/ycode');
    }
  }, [isLoading, session, router]);

  // CX: fetch the flag directly (this layout renders outside YCodeBuilder,
  // so the settings store may not be populated yet).
  useEffect(() => {
    if (isLoading || !session) return;

    let cancelled = false;
    fetch(`/ycode/api/settings/${CX_FEATURES_SETTING_KEY}`)
      .then((res) => (res.ok ? res.json() : { data: null }))
      .then((body) => {
        if (cancelled) return;
        const allowed = resolveCxFeatures(body?.data).devtools;
        setDevtoolsAllowed(allowed);
        if (!allowed) router.push('/ycode');
      })
      .catch(() => {
        // Non-fatal: if the check fails, default to allowing access rather
        // than locking out the team from an internal tool.
        if (!cancelled) setDevtoolsAllowed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoading, session, router]);

  if (isLoading || !session || devtoolsAllowed === null || !devtoolsAllowed) {
    return <BuilderLoading message="Checking setup" />;
  }

  return <>{children}</>;
}

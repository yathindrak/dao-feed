'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useEffect, useRef } from 'react';

export default function AuthCheck() {
  const { authenticated, login, ready } = usePrivy();
  const loginAttempted = useRef(false);

  useEffect(() => {
    if (ready && !authenticated && !loginAttempted.current) {
      loginAttempted.current = true;
      login();
    }
  }, [ready, authenticated, login]);

  return null;
}

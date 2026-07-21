"use client";

import { asyncWithLDProvider } from 'launchdarkly-react-client-sdk';
import Observability from '@launchdarkly/observability';
import SessionReplay from '@launchdarkly/session-replay';
import { ReactNode, useEffect, useState } from 'react';
import { getDeviceType, getBrowserName, getOrCreateSessionId, detectBrowser, shouldOptimizeForPerformance } from '@/lib/utils';
import { APP_VERSION, ldApplicationMetadata } from '@/lib/appVersion';
import LDIdentify from './LDIdentify';

interface LaunchDarklyProviderProps {
  children: ReactNode;
}

function LaunchDarklyProviderContent({ children }: LaunchDarklyProviderProps) {
  const [LDProvider, setLDProvider] = useState<React.ComponentType<{ children: ReactNode }> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeLD = async () => {
      try {
        const sessionId = getOrCreateSessionId();
        const { isBrave } = detectBrowser();
        const shouldOptimize = shouldOptimizeForPerformance();
        
        // Log browser detection for debugging
        if (isBrave) {
          console.log('LaunchDarkly: Detected Brave browser, disabling session replay for performance');
        }
        if (shouldOptimize && !isBrave) {
          console.log('LaunchDarkly: Detected performance optimization needed');
        }
        
        // Pre-login: a single `session` context kind only. Once the user signs
        // in, <LDIdentify> swaps in a multi-context that adds the `user` kind.
        const context = {
          kind: "session",
          key: sessionId,
          deviceType: getDeviceType(),
          browser: getBrowserName(),
          appVersion: APP_VERSION,
        };

        console.log('Initializing LaunchDarkly with session context');

        const provider = await asyncWithLDProvider({
          clientSideID: process.env.NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID!,
          context,
          options: {
            application: ldApplicationMetadata,
            plugins: [
                new Observability({
                  networkRecording: {
                    enabled: true,
                    recordHeadersAndBody: true
                  }
                }),
                new SessionReplay({
                  privacySetting: 'default',
                })
              ]
            // Optional: Add any additional configuration here
          },
          reactOptions: {},
          deferInitialization: false,
          timeout: 3
        });

        setLDProvider(() => provider);
      } catch (error) {
        console.error('Failed to initialize LaunchDarkly:', error instanceof Error ? error.message : 'Unknown error');
        // Fallback: create a simple provider that just renders children
        function LDFallbackProvider({ children }: { children: ReactNode }) {
          return <>{children}</>;
        }
        setLDProvider(() => LDFallbackProvider);
      } finally {
        setIsLoading(false);
      }
    };

    // Initialize only once when component mounts
    initializeLD();
  }, []); // Remove session and status dependencies

  if (isLoading || !LDProvider) {
    return <div>Loading...</div>;
  }

  return (
    <LDProvider>
      <LDIdentify />
      {children}
    </LDProvider>
  );
}

export default function LaunchDarklyProvider({ children }: LaunchDarklyProviderProps) {
  return <LaunchDarklyProviderContent>{children}</LaunchDarklyProviderContent>;
} 
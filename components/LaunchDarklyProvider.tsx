"use client";

import { asyncWithLDProvider } from 'launchdarkly-react-client-sdk';
import Observability from '@launchdarkly/observability';
import SessionReplay from '@launchdarkly/session-replay';
import { ReactNode, useEffect, useState } from 'react';
import { getDeviceType, detectBrowser, shouldOptimizeForPerformance } from '@/lib/utils';
import packageJson from '../package.json';

// Generate a unique session ID for this browser session
const generateSessionId = () => {
  // Use localStorage to persist session ID across page reloads
  const storedSessionId = localStorage.getItem('ld_session_id');
  if (storedSessionId) {
    return storedSessionId;
  }
  
  // Generate new session ID if none exists
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  localStorage.setItem('ld_session_id', sessionId);
  return sessionId;
};

interface LaunchDarklyProviderProps {
  children: ReactNode;
}

function LaunchDarklyProviderContent({ children }: LaunchDarklyProviderProps) {
  const [LDProvider, setLDProvider] = useState<React.ComponentType<{ children: ReactNode }> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeLD = async () => {
      try {
        const sessionId = generateSessionId();
        const { isBrave } = detectBrowser();
        const shouldOptimize = shouldOptimizeForPerformance();
        
        // Log browser detection for debugging
        if (isBrave) {
          console.log('LaunchDarkly: Detected Brave browser, disabling session replay for performance');
        }
        if (shouldOptimize && !isBrave) {
          console.log('LaunchDarkly: Detected performance optimization needed');
        }
        
        // Initialize with basic context - the hook will update it dynamically
        const context = {
          kind: "multi",
          session: {
            key: sessionId,
          },
          user: {
            key: 'anonymous',
            name: 'Anonymous User',
            deviceType: getDeviceType(),
          }
        };

        console.log('Initializing LaunchDarkly with basic context');

        const provider = await asyncWithLDProvider({
          clientSideID: process.env.NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID!,
          context,
          options: {
            application: {
                id: packageJson.name,
                version: packageJson.version,
            },
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
        setLDProvider(() => ({ children }: { children: ReactNode }) => <>{children}</>);
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

  return <LDProvider>{children}</LDProvider>;
}

export default function LaunchDarklyProvider({ children }: LaunchDarklyProviderProps) {
  return <LaunchDarklyProviderContent>{children}</LaunchDarklyProviderContent>;
} 
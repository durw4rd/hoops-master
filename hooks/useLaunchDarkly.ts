import { useFlags, useLDClient } from 'launchdarkly-react-client-sdk';
import { useSession } from 'next-auth/react';
import { useEffect, useRef, useCallback } from 'react';
import { getDeviceType } from '@/lib/utils';

export function useLaunchDarkly() {
  const flags = useFlags();
  const client = useLDClient();
  const { data: session, status } = useSession();
  const lastUserKey = useRef<string | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debug: Log flag changes (only in development)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('LaunchDarkly flags updated:', flags);
    }
  }, [flags]);

  // Listen for flag changes
  useEffect(() => {
    if (client) {
      const handleFlagChange = (changes: any) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('LaunchDarkly flag changes detected:', changes);
        }
      };

      client.on('change', handleFlagChange);

      return () => {
        client.off('change', handleFlagChange);
      };
    }
  }, [client]);

  // Debounced context update function
  const debouncedUpdateContext = useCallback(async () => {
    if (!client || status === 'loading') return;

    try {
      // Get current context to check if it needs updating
      const currentContext = client.getContext();
      const currentUserKey = (() => {
        if (currentContext && 'user' in currentContext) {
          return currentContext.user?.key;
        }
        return undefined;
      })();
      const newUserKey = session?.user?.email || 'anonymous';
      
      // Only update if the user context has actually changed
      if (currentUserKey !== newUserKey && newUserKey !== lastUserKey.current) {
        lastUserKey.current = newUserKey;
        
        // Generate session ID for this browser session
        const sessionId = (() => {
          const storedSessionId = localStorage.getItem('ld_session_id');
          if (storedSessionId) {
            return storedSessionId;
          }
          const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          localStorage.setItem('ld_session_id', newSessionId);
          return newSessionId;
        })();

        // Create new context based on current session status
        const newContext = {
          kind: "multi",
          session: {
            key: sessionId,
          },
          user: {
            key: newUserKey,
            name: session?.user?.name || session?.user?.email || 'Anonymous User',
            deviceType: getDeviceType(),
          }
        };

        // Update the context using identify
        await client.identify(newContext);
      }
    } catch (error) {
      console.error('Failed to update LaunchDarkly context:', error);
    }
  }, [client, session, status]);

  // Auto-update context when session changes (debounced)
  useEffect(() => {
    // Clear any existing timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // Debounce the update to avoid excessive calls
    updateTimeoutRef.current = setTimeout(() => {
      debouncedUpdateContext();
    }, 100); // 100ms debounce

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [debouncedUpdateContext]);

  return {
    flags,
    client,
    // Helper function to get flag value
    getFlagValue: (flagKey: string, defaultValue?: any) => {
      const flag = flags[flagKey];
      return flag !== undefined ? flag : defaultValue;
    },
    // Helper function to manually update context
    updateContext: async (userContext: any) => {
      if (client) {
        try {
          const sessionId = localStorage.getItem('ld_session_id') || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const context = {
            kind: "multi",
            session: {
              key: sessionId,
            },
            user: {
              ...userContext,
              deviceType: getDeviceType(),
            }
          };
          await client.identify(context);
        } catch (error) {
          console.error('Failed to update LaunchDarkly context:', error);
        }
      }
    }
  };
} 
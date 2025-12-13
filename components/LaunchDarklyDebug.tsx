"use client";

import { useLaunchDarkly } from '@/hooks/useLaunchDarkly';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { getDeviceType } from '@/lib/utils';
import { Flag, User, Monitor, Settings } from 'lucide-react';

export default function LaunchDarklyDebug() {
  const { flags, getFlagValue, client } = useLaunchDarkly();
  const [updateCount, setUpdateCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Track when flags change
  useEffect(() => {
    setUpdateCount(prev => prev + 1);
    setLastUpdate(new Date());
    console.log('LaunchDarkly flags updated:', flags);
  }, [flags]);

  const detectedDeviceType = getDeviceType();
  const currentContext = client?.getContext();
  const adminMode = getFlagValue('adminMode', false);

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flag className="w-5 h-5" />
          LaunchDarkly Debug Panel
        </CardTitle>
        <CardDescription>
          Complete LaunchDarkly context, flags, and variations for the current user
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Context Information */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4" />
            <h4 className="text-sm font-medium">Context Information</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">Session ID:</span>
                <Badge variant="outline" className="text-xs">
                  {typeof window !== 'undefined' && localStorage.getItem('ld_session_id')?.substring(0, 20)}...
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">User Key:</span>
                <Badge variant="outline" className="text-xs">
                  {currentContext && 'user' in currentContext ? currentContext.user?.key || 'N/A' : 'N/A'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">User Name:</span>
                <Badge variant="outline" className="text-xs">
                  {currentContext && 'user' in currentContext ? currentContext.user?.name || 'N/A' : 'N/A'}
                </Badge>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">Device Type:</span>
                <Badge variant={detectedDeviceType === 'mobile' ? "default" : "secondary"}>
                  {detectedDeviceType}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Viewport:</span>
                <Badge variant="outline" className="text-xs">
                  {typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Screen:</span>
                <Badge variant="outline" className="text-xs">
                  {typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : 'N/A'}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* All Flags */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            <h4 className="text-sm font-medium">All Flags & Variations</h4>
          </div>
          <div className="space-y-2">
            {Object.entries(flags).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {Object.entries(flags).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between p-2 border rounded">
                    <span className="font-mono text-xs">{key}</span>
                    <Badge variant={value ? "default" : "secondary"}>
                      {String(value)}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">No flags available</p>
            )}
          </div>
        </div>

        {/* Admin Mode Status */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flag className="w-5 h-5" />
                  Feature Flags
                </CardTitle>
                <CardDescription>
                  Current flag values and status
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">showFlagsTab:</span>
                  <Badge variant={getFlagValue('showFlagsTab', false) ? "default" : "secondary"}>
                    {getFlagValue('showFlagsTab', false) ? "ON" : "OFF"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">adminMode:</span>
                  <Badge variant={adminMode ? "default" : "secondary"}>
                    {adminMode ? "ON" : "OFF"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">show-tournament-features:</span>
                  <Badge variant={getFlagValue('show-tournament-features', false) ? "default" : "secondary"}>
                    {getFlagValue('show-tournament-features', false) ? "ON" : "OFF"}
                  </Badge>
                </div>
                {adminMode && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 text-red-800">
                      <span className="text-lg">🔧</span>
                      <span className="text-sm font-medium">Admin Mode Active</span>
                    </div>
                    <p className="text-xs text-red-600 mt-1">
                      You have admin privileges. Player badges will be clickable for reassignment.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Debug Actions */}
        <div className="pt-4 space-y-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              console.log('LaunchDarkly Debug Info:', {
                context: currentContext,
                flags,
                updateCount,
                lastUpdate,
                deviceType: detectedDeviceType
              });
            }}
            className="w-full"
          >
            Log Debug Info to Console
          </Button>
        </div>
      </CardContent>
    </Card>
  );
} 
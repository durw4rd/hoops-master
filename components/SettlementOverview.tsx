'use client';

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, TrendingUp, TrendingDown, DollarSign, RefreshCw } from 'lucide-react';

interface PlayerCredit {
  playerName: string;
  credits: number;
  slotsGivenAway: number;
  slotsClaimed: number;
  slotsSettled: number;
  slotsGivenAway1h: number;
  slotsGivenAway2h: number;
  slotsClaimed1h: number;
  slotsClaimed2h: number;
}

interface UserPreference {
  smartSettle: boolean;
  email: string;
  color?: string;
  role?: string;
}

interface SettlementOverviewData {
  playerCredits: PlayerCredit[];
  userPreferences: { [playerName: string]: UserPreference };
}

interface SettlementOverviewProps {
  currentPlayer?: string;
}

export interface SettlementOverviewRef {
  refresh: () => void;
}

const SettlementOverview = forwardRef<SettlementOverviewRef, SettlementOverviewProps>(
  ({ currentPlayer }, ref) => {
  const [settlementData, setSettlementData] = useState<SettlementOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Expose refresh method to parent component
  useImperativeHandle(ref, () => ({
    refresh: () => {
      fetchSettlementOverview();
    }
  }));

  useEffect(() => {
    fetchSettlementOverview();
  }, []);

  const fetchSettlementOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/settlement/calculate');
      if (!response.ok) {
        throw new Error('Failed to fetch settlement overview');
      }
      
      const data = await response.json();
      
      // Fetch user preferences
      const userMappingResponse = await fetch('/api/players/preferences');
      const userMappingData = await userMappingResponse.json();
      
      setSettlementData({
        playerCredits: data.data.playerCredits || [],
        userPreferences: userMappingData.data || {}
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSettlementOverview();
    setRefreshing(false);
  };



  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Settlement Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Settlement Overview
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" />
            <span>Error loading settlement data: {error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!settlementData) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="text-center text-gray-500">
            No settlement data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const { playerCredits } = settlementData;
  const creditors = playerCredits.filter((p: PlayerCredit) => p.credits > 0).sort((a: PlayerCredit, b: PlayerCredit) => b.credits - a.credits);
  const debtors = playerCredits.filter((p: PlayerCredit) => p.credits < 0).sort((a: PlayerCredit, b: PlayerCredit) => a.credits - b.credits);
  const neutral = playerCredits.filter((p: PlayerCredit) => p.credits === 0);

  const totalCredits = creditors.reduce((sum, p) => sum + p.credits, 0);
  const totalDebits = Math.abs(debtors.reduce((sum, p) => sum + p.credits, 0));

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Settlement Overview</span>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">


        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-green-50 rounded-lg">
            <div className="text-lg font-bold text-green-600">€{totalCredits.toFixed(2)}</div>
            <div className="text-xs text-green-600">Total Owed</div>
          </div>
          <div className="p-3 bg-red-50 rounded-lg">
            <div className="text-lg font-bold text-red-600">€{totalDebits.toFixed(2)}</div>
            <div className="text-xs text-red-600">Total Debt</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-lg font-bold text-gray-600">{playerCredits.length}</div>
            <div className="text-xs text-gray-600">Players</div>
          </div>
        </div>

        {/* Creditors */}
        {creditors.length > 0 && (
          <div>
            <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Players Owed Money ({creditors.length})
            </h3>
            <div className="space-y-2">
              {creditors.map((player) => (
                <div 
                  key={player.playerName}
                  className={`grid grid-cols-12 gap-2 items-center p-3 rounded-lg border ${
                    currentPlayer === player.playerName 
                      ? 'border-blue-300 bg-blue-50' 
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="col-span-3 font-medium">{player.playerName}</div>
                  <div className="col-span-6 text-center">
                    <Badge variant="secondary" className="text-xs">
                      {player.slotsGivenAway} given{player.slotsGivenAway2h > 0 ? ` (${player.slotsGivenAway2h}×2h)` : ''}<br />
                      {player.slotsClaimed} claimed{player.slotsClaimed2h > 0 ? ` (${player.slotsClaimed2h}×2h)` : ''}
                    </Badge>
                    {player.slotsSettled > 0 && (
                      <div className="mt-1">
                        <Badge variant="outline" className="text-xs text-blue-600 border-blue-300 bg-blue-50">
                          {player.slotsSettled} settled
                        </Badge>
                      </div>
                    )}
                  </div>
                  <div className="col-span-3 text-right">
                    <span className="text-green-600 font-bold">+€{player.credits.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Debtors */}
        {debtors.length > 0 && (
          <div>
            <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Players Who Owe Money ({debtors.length})
            </h3>
            <div className="space-y-2">
              {debtors.map((player) => (
                <div 
                  key={player.playerName}
                  className={`grid grid-cols-12 gap-2 items-center p-3 rounded-lg border ${
                    currentPlayer === player.playerName 
                      ? 'border-blue-300 bg-blue-50' 
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="col-span-3 font-medium">{player.playerName}</div>
                  <div className="col-span-6 text-center">
                    <Badge variant="secondary" className="text-xs">
                      {player.slotsGivenAway} given{player.slotsGivenAway2h > 0 ? ` (${player.slotsGivenAway2h}×2h)` : ''}<br />
                      {player.slotsClaimed} claimed{player.slotsClaimed2h > 0 ? ` (${player.slotsClaimed2h}×2h)` : ''}
                    </Badge>
                    {player.slotsSettled > 0 && (
                      <div className="mt-1">
                        <Badge variant="outline" className="text-xs text-blue-600 border-blue-300 bg-blue-50">
                          {player.slotsSettled} settled
                        </Badge>
                      </div>
                    )}
                  </div>
                  <div className="col-span-3 text-right">
                    <span className="text-red-600 font-bold">-€{Math.abs(player.credits).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Neutral Players */}
        {neutral.length > 0 && (
          <div>
            <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-gray-600" />
              All Settled Up ({neutral.length})
            </h3>
            <div className="space-y-2">
              {neutral.map((player) => (
                <div 
                  key={player.playerName}
                  className={`grid grid-cols-12 gap-4 items-center p-3 rounded-lg border ${
                    currentPlayer === player.playerName 
                      ? 'border-blue-300 bg-blue-50' 
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="col-span-3 font-medium">{player.playerName}</div>
                  <div className="col-span-7 text-center">
                    <Badge variant="secondary" className="text-xs">
                      {player.slotsGivenAway} given{player.slotsGivenAway2h > 0 ? ` (${player.slotsGivenAway2h}×2h)` : ''}<br />
                      {player.slotsClaimed} claimed{player.slotsClaimed2h > 0 ? ` (${player.slotsClaimed2h}×2h)` : ''}
                    </Badge>
                    {player.slotsSettled > 0 && (
                      <div className="mt-1">
                        <Badge variant="outline" className="text-xs text-blue-600 border-blue-300 bg-blue-50">
                          {player.slotsSettled} settled
                        </Badge>
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-gray-600 font-bold">€0.00</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

SettlementOverview.displayName = 'SettlementOverview';

export default SettlementOverview;

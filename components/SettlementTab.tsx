'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronDown, ChevronRight } from 'lucide-react';
import SettlementOverview from './SettlementOverview';
import SettlementBatchesView from './SettlementBatchesView';

interface SettlementTabProps {
  currentPlayer?: string;
  loggedInUser?: any;
}

interface SettlementOverviewRef {
  refresh: () => void;
}

export default function SettlementTab({ currentPlayer, loggedInUser }: SettlementTabProps) {
  const [smartSettle, setSmartSettle] = useState(true);
  const [updatingPreference, setUpdatingPreference] = useState(false);
  const [showOptOutDialog, setShowOptOutDialog] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<boolean | null>(null);
  const [isInfoCollapsed, setIsInfoCollapsed] = useState(true);
  const settlementOverviewRef = useRef<SettlementOverviewRef>(null);

  // Load current smartSettle preference when component mounts
  useEffect(() => {
    if (currentPlayer) {
      fetchCurrentPreference();
    }
  }, [currentPlayer]);

  const fetchCurrentPreference = async () => {
    try {
      const response = await fetch('/api/players/preferences');
      if (response.ok) {
              const data = await response.json();
      if (currentPlayer && data.data[currentPlayer]) {
        const userPreference = data.data[currentPlayer];
        setSmartSettle(userPreference.smartSettle);
      }
      }
    } catch (error) {
      console.error('Failed to fetch current preference:', error);
    }
  };

  const handleSmartSettleToggle = async (enabled: boolean) => {
    if (!currentPlayer) return;
    
    // If opting out, show confirmation dialog
    if (!enabled) {
      setPendingToggle(false);
      setShowOptOutDialog(true);
      return;
    }
    
    // If opting in, proceed immediately
    await updateSmartSettlePreference(enabled);
  };

  const updateSmartSettlePreference = async (enabled: boolean) => {
    if (!currentPlayer) return;
    
    try {
      setUpdatingPreference(true);
      
      const response = await fetch('/api/players/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerName: currentPlayer,
          smartSettle: enabled,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update preference');
      }

      setSmartSettle(enabled);
      
      // Refresh the settlement overview to reflect the new preference
      if (settlementOverviewRef.current) {
        settlementOverviewRef.current.refresh();
      }
    } catch (error) {
      console.error('Failed to update preference:', error);
    } finally {
      setUpdatingPreference(false);
    }
  };

  const handleOptOutConfirm = async () => {
    setShowOptOutDialog(false);
    if (pendingToggle !== null) {
      await updateSmartSettlePreference(pendingToggle);
      setPendingToggle(null);
    }
  };

  const handleOptOutCancel = () => {
    setShowOptOutDialog(false);
    setPendingToggle(null);
  };

  return (
    <>
      <div className="w-full space-y-4">
        {/* Smart Settlement Toggle at the top */}
        {currentPlayer && (
          <Card className="w-full">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Smart Settlement</p>
                  <p className="text-xs text-gray-600">
                    {smartSettle 
                      ? "Participating in calculations & simplification" 
                      : "Excluded from calculations & simplification"
                    }
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {updatingPreference && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  )}
                  <Switch
                    checked={smartSettle}
                    onCheckedChange={handleSmartSettleToggle}
                    disabled={updatingPreference}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Settlement Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Credit Overview</TabsTrigger>
            <TabsTrigger value="batches">Transaction Pairings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-4">
            {/* Global Disclaimer */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  <div className="text-blue-600 mt-0.5">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Player Credit Calculation Details</p>
                    {!isInfoCollapsed && (
                      <p className="text-xs">Calculates balance based on the marketplace transactions. 1h = €3.80, 2h = €7.60. Slots marked as settled are excluded. <br/>If you opt out of the Smart Settlement, <i>only</i> the slots you've given away will be excluded from the credit calculations.</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsInfoCollapsed(!isInfoCollapsed)}
                  className="p-1 h-auto text-blue-600 hover:text-blue-800"
                >
                  {isInfoCollapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Settlement Overview */}
            <SettlementOverview ref={settlementOverviewRef} currentPlayer={currentPlayer} />
          </TabsContent>
          
          <TabsContent value="batches">
            <SettlementBatchesView loggedInUser={loggedInUser} currentPlayer={currentPlayer} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Opt-out Confirmation Dialog */}
      <AlertDialog open={showOptOutDialog} onOpenChange={setShowOptOutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Opt out of Smart Settlement?</AlertDialogTitle>
            <AlertDialogDescription>
              If you opt out, your slots will be excluded from settlement calculations. 
              This means you won't be included in debt simplification, but you'll still 
              need to settle any existing debts manually.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleOptOutCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleOptOutConfirm}>Opt Out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus, Play, CheckCircle, UserCheck } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

// Helper function to safely format dates
function formatDate(dateString: string | undefined): string {
  if (!dateString) return 'Invalid date';
  
  try {
    // Try to parse as ISO date first (YYYY-MM-DD)
    const date = parseISO(dateString);
    if (!isNaN(date.getTime())) {
      return format(date, 'MMM dd, yyyy');
    }
    
    // If that fails, try to parse as DD.MM format
    const parts = dateString.split('.');
    if (parts.length === 2) {
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      if (!isNaN(day) && !isNaN(month)) {
        const date = new Date(new Date().getFullYear(), month - 1, day);
        return format(date, 'MMM dd');
      }
    }
    
    return 'Invalid date';
  } catch (error) {
    return 'Invalid date';
  }
}

interface SettlementBatch {
  id: string;
  name: string;
  fromDate: string;
  toDate: string;
  status: 'active' | 'settled';
  createdAt: string;
  settledAt?: string;
  totalTransactions: number;
  totalAmount: number;
}

interface SettlementPairing {
  id: string;
  batchId: string;
  creditorPlayer: string;
  debtorPlayer: string;
  amount: number;
  status: 'pending' | 'completed';
  createdAt: string;
  completedAt?: string;
}

interface SettlementBatchesViewProps {
  loggedInUser?: any;
  currentPlayer?: string;
}

// Helper function to group pairings by creditor
function groupPairingsByCreditor(pairings: SettlementPairing[]) {
  const creditorGroups: Record<string, {
    creditorName: string;
    totalAmount: number;
    debtors: Array<{
      debtorName: string;
      amount: number;
      status: 'pending' | 'completed';
      pairingId: string;
    }>;
  }> = {};

  for (const pairing of pairings) {
    if (!creditorGroups[pairing.creditorPlayer]) {
      creditorGroups[pairing.creditorPlayer] = {
        creditorName: pairing.creditorPlayer,
        totalAmount: 0,
        debtors: []
      };
    }

    creditorGroups[pairing.creditorPlayer].totalAmount += pairing.amount;
    creditorGroups[pairing.creditorPlayer].debtors.push({
      debtorName: pairing.debtorPlayer,
      amount: pairing.amount,
      status: pairing.status,
      pairingId: pairing.id
    });
  }

  return Object.values(creditorGroups).sort((a, b) => b.totalAmount - a.totalAmount);
}

export default function SettlementBatchesView({ loggedInUser, currentPlayer }: SettlementBatchesViewProps) {
  const [batches, setBatches] = useState<SettlementBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    fromDate: null as Date | null,
    toDate: null as Date | null
  });
  const [pairings, setPairings] = useState<Record<string, SettlementPairing[]>>({});
  const [userRole, setUserRole] = useState<string>('');

  useEffect(() => {
    fetchBatches();
    fetchUserRole();
  }, []);

  const fetchUserRole = async () => {
    if (!loggedInUser?.user?.email) return;
    
    try {
      const response = await fetch('/api/players/preferences');
      if (response.ok) {
        const data = await response.json();
        // Find the user by email to get their role
        for (const [playerName, userData] of Object.entries(data.data)) {
          const typedUserData = userData as { email: string; role?: string };
          if (typedUserData.email === loggedInUser.user.email) {
            setUserRole(typedUserData.role || '');
            break;
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch user role:', error);
    }
  };

  const fetchBatches = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/settlement/batches');
      const data = await response.json();
      
      if (data.success) {
        setBatches(data.data);
        // Fetch pairings for each batch
        await Promise.all(
          data.data.map(async (batch: SettlementBatch) => {
            if (batch.status === 'active') {
              await fetchPairings(batch.id);
            }
          })
        );
      }
    } catch (error) {
      console.error('Error fetching batches:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPairings = async (batchId: string) => {
    try {
      const response = await fetch(`/api/settlement/pairings?batchId=${batchId}`);
      const data = await response.json();
      
      if (data.success) {
        setPairings(prev => ({
          ...prev,
          [batchId]: data.data
        }));
      }
    } catch (error) {
      console.error('Error fetching pairings:', error);
    }
  };

  const handleCreateBatch = async () => {
    if (!createForm.name || !createForm.fromDate || !createForm.toDate) {
      return;
    }

    if (!loggedInUser?.user?.email) {
      return;
    }

    try {
      const response = await fetch('/api/settlement/batches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': loggedInUser.user.email,
        },
        body: JSON.stringify({
          name: createForm.name,
          fromDate: format(createForm.fromDate, 'yyyy-MM-dd'),
          toDate: format(createForm.toDate, 'yyyy-MM-dd'),
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setShowCreateForm(false);
        setCreateForm({ name: '', fromDate: null, toDate: null });
        fetchBatches();
      }
    } catch (error) {
      console.error('Error creating batch:', error);
    }
  };

  const handleCreatePairings = async (batchId: string) => {
    if (!loggedInUser?.user?.email) {
      return;
    }

    try {
      const response = await fetch('/api/settlement/pairings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': loggedInUser.user.email,
        },
        body: JSON.stringify({ batchId }),
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchPairings(batchId);
      }
    } catch (error) {
      console.error('Error creating pairings:', error);
    }
  };

  const handleSettleBatch = async (batchId: string) => {
    if (!confirm('Are you sure you want to mark this batch as settled? This will mark all linked slots as settled.')) {
      return;
    }

    if (!loggedInUser?.user?.email) {
      return;
    }

    try {
      const response = await fetch('/api/slots/batch-settle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': loggedInUser.user.email,
        },
        body: JSON.stringify({ batchId }),
      });

      const data = await response.json();
      
      if (data.success) {
        fetchBatches();
      }
    } catch (error) {
      console.error('Error settling batch:', error);
    }
  };

  const handleMarkTransactionCompleted = async (pairing: SettlementPairing) => {
    if (!loggedInUser?.user?.email) {
      return;
    }

    try {
      const response = await fetch('/api/settlement/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': loggedInUser.user.email,
        },
        body: JSON.stringify({
          pairingId: pairing.id,
          batchId: pairing.batchId,
          creditorPlayer: pairing.creditorPlayer,
          debtorPlayer: pairing.debtorPlayer,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        // Refresh pairings for this batch
        await fetchPairings(pairing.batchId);
      }
    } catch (error) {
      console.error('Error marking transaction as completed:', error);
    }
  };

  // Calculate total amount and transactions for a batch
  const calculateBatchStats = (batchId: string) => {
    const batchPairings = pairings[batchId] || [];
    const totalAmount = batchPairings.reduce((sum, pairing) => sum + pairing.amount, 0);
    const totalTransactions = batchPairings.length;
    return { totalAmount, totalTransactions };
  };

  if (loading) {
    return <div className="text-center py-8">Loading transaction pairings...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Transaction Pairings</h2>
        {userRole === 'admin' && (
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Batch
          </Button>
        )}
      </div>

      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Settlement Batch</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Batch Name</Label>
              <Input
                id="name"
                value={createForm.name}
                onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., August 2024 Settlement"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>From Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !createForm.fromDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {createForm.fromDate ? format(createForm.fromDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={createForm.fromDate || undefined}
                      onSelect={(date) => setCreateForm(prev => ({ ...prev, fromDate: date || null }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div>
                <Label>To Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !createForm.toDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {createForm.toDate ? format(createForm.toDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={createForm.toDate || undefined}
                      onSelect={(date) => setCreateForm(prev => ({ ...prev, toDate: date || null }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button onClick={handleCreateBatch}>Create Batch</Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {batches.map((batch) => {
          const { totalAmount, totalTransactions } = calculateBatchStats(batch.id);
          return (
            <Card key={batch.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {batch.name}
                      <Badge variant={batch.status === 'active' ? 'default' : 'secondary'}>
                        {batch.status === 'active' ? 'Active' : 'Settled'}
                      </Badge>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(batch.fromDate)} - {formatDate(batch.toDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="text-lg font-semibold">€{totalAmount.toFixed(2)}</p>
                    <p className="text-sm text-muted-foreground">{totalTransactions} transactions</p>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                {batch.status === 'active' && (
                  <div className="space-y-4">
                    {pairings[batch.id] ? (
                      <div>
                        <h4 className="font-medium mb-3">Settlement Overview</h4>
                        <div className="space-y-4">
                          {groupPairingsByCreditor(pairings[batch.id]).map((creditorGroup) => (
                            <div key={creditorGroup.creditorName} className="border rounded-lg p-3 bg-card">
                              <div className="flex justify-between items-center mb-2">
                                <h5 className="font-semibold text-lg">{creditorGroup.creditorName}</h5>
                                <span className="text-lg font-bold text-green-600">
                                  €{creditorGroup.totalAmount.toFixed(2)}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground mb-3">
                                Total amount owed to {creditorGroup.creditorName}
                              </p>
                              <div className="space-y-2">
                                {creditorGroup.debtors.map((debtor) => (
                                  <div key={debtor.debtorName} className="flex justify-between items-center py-2 px-3 bg-muted rounded">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{debtor.debtorName}</span>
                                      {debtor.status === 'completed' && (
                                        <Badge variant="secondary" className="text-xs">
                                          <UserCheck className="w-3 h-3 mr-1" />
                                          Settled
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-red-600">
                                        €{debtor.amount.toFixed(2)}
                                      </span>
                                      {debtor.status === 'pending' && 
                                        (currentPlayer === creditorGroup.creditorName || 
                                         currentPlayer === debtor.debtorName) && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              const pairing = pairings[batch.id]?.find(p => p.id === debtor.pairingId);
                                              if (pairing) {
                                                handleMarkTransactionCompleted(pairing);
                                              }
                                            }}
                                          >
                                            <CheckCircle className="w-3 h-3 mr-1" />
                                            Mark Settled
                                          </Button>
                                        )
                                      }
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No pairings created yet</p>
                    )}
                    
                    <div className="flex gap-2">
                      {(!pairings[batch.id] || pairings[batch.id].length === 0) && (
                        <Button onClick={() => handleCreatePairings(batch.id)}>
                          <Play className="w-4 h-4 mr-2" />
                          Create Pairings
                        </Button>
                      )}
                      {userRole === 'admin' && (
                        <Button 
                          variant="outline" 
                          onClick={() => handleSettleBatch(batch.id)}
                          disabled={!pairings[batch.id] || pairings[batch.id].length === 0}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Mark Batch as Settled
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                
                {batch.status === 'settled' && (
                  <div className="text-sm text-muted-foreground">
                    Settled on {formatDate(batch.settledAt)}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        
        {batches.length === 0 && (
          <Card>
            <CardContent className="text-center py-8 text-muted-foreground">
              No transaction pairings created yet. Create your first batch to get started.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

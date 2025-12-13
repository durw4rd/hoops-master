import { PlayerCredit, SimplifiedDebt, UserSettlementPreferences } from './googleSheets';

/**
 * Core settlement calculation service
 * Handles credit-based calculations and debt simplification
 */
export class SettlementCalculator {
  private static readonly SLOT_COST_1H = 3.80; // €3.80 per 1-hour slot
  private static readonly SLOT_COST_2H = 7.60; // €7.60 per 2-hour slot

  /**
   * Calculate player credits from marketplace data
   * Counts slots given away vs slots claimed for each player
   * Excludes slots given away by players who opted out of smartSettle
   */
  static calculatePlayerCredits(slots: any[], userPreferences: UserSettlementPreferences): PlayerCredit[] {
    const playerCredits = new Map<string, PlayerCredit>();

    // First pass: count settled slots for each player
    for (const slot of slots) {
      // Only count settled slots that were part of the settlement system
      if (slot.Settled === 'yes' && ['claimed', 'reassigned', 'admin-reassigned'].includes(slot.Status)) {
        // Only count settled slots for the player who originally gave away the slot (was owed money)
        // The player who claimed the slot doesn't get a settled slot count since they already paid
        if (slot.Player && slot.Player !== 'free spot') {
          if (!playerCredits.has(slot.Player)) {
            playerCredits.set(slot.Player, {
              playerName: slot.Player,
              credits: 0,
              slotsGivenAway: 0,
              slotsClaimed: 0,
              slotsSettled: 0,
              slotsGivenAway1h: 0,
              slotsGivenAway2h: 0,
              slotsClaimed1h: 0,
              slotsClaimed2h: 0
            });
          }
          playerCredits.get(slot.Player)!.slotsSettled += 1;
        }
      }
    }

    // Second pass: calculate active credits (excluding settled slots)
    for (const slot of slots) {
      // Skip settled slots and swaps
      if (slot.Settled === 'yes' || slot.SwapRequested === 'yes') {
        continue;
      }

      // Only consider claimed, reassigned, or admin-reassigned slots
      if (!['claimed', 'reassigned', 'admin-reassigned'].includes(slot.Status)) {
        continue;
      }

      // Skip slots with missing data that would break zero-sum system
      if (!slot.Player || !slot.ClaimedBy || slot.Player === 'free spot') {
        continue;
      }

      // Calculate slot cost based on duration
      const slotCost = this.getSlotCost(slot.Time);

      // Get both players involved in this transaction
      const originalPlayer = slot.Player;
      const claimedBy = slot.ClaimedBy;
      
      // Check if the original player (who gave away the slot) has opted in to smartSettle
      // If they opted out, exclude this entire transaction from calculations
      const originalPlayerPrefs = userPreferences[originalPlayer];
      const originalPlayerOptedIn = originalPlayerPrefs?.smartSettle !== false;
      
      // Only process this transaction if the original player is opted in
      if (originalPlayerOptedIn) {
        // Count slot given away by original player
        if (!playerCredits.has(originalPlayer)) {
          playerCredits.set(originalPlayer, {
            playerName: originalPlayer,
            credits: 0,
            slotsGivenAway: 0,
            slotsClaimed: 0,
            slotsSettled: 0,
            slotsGivenAway1h: 0,
            slotsGivenAway2h: 0,
            slotsClaimed1h: 0,
            slotsClaimed2h: 0
          });
        }
        const originalPlayerCredit = playerCredits.get(originalPlayer)!;
        originalPlayerCredit.credits = parseFloat((originalPlayerCredit.credits + slotCost).toFixed(2));
        originalPlayerCredit.slotsGivenAway += 1;
        
        // Track 1h vs 2h slots given away
        if (slotCost === this.SLOT_COST_1H) {
          originalPlayerCredit.slotsGivenAway1h += 1;
        } else {
          originalPlayerCredit.slotsGivenAway2h += 1;
        }

        // Count slot claimed by the claimer
        if (!playerCredits.has(claimedBy)) {
          playerCredits.set(claimedBy, {
            playerName: claimedBy,
            credits: 0,
            slotsGivenAway: 0,
            slotsClaimed: 0,
            slotsSettled: 0,
            slotsGivenAway1h: 0,
            slotsGivenAway2h: 0,
            slotsClaimed1h: 0,
            slotsClaimed2h: 0
          });
        }
        const claimerCredit = playerCredits.get(claimedBy)!;
        claimerCredit.credits = parseFloat((claimerCredit.credits - slotCost).toFixed(2));
        claimerCredit.slotsClaimed += 1;
        
        // Track 1h vs 2h slots claimed
        if (slotCost === this.SLOT_COST_1H) {
          claimerCredit.slotsClaimed1h += 1;
        } else {
          claimerCredit.slotsClaimed2h += 1;
        }
      }
      // If either player has opted out, the entire transaction is excluded
    }

    return Array.from(playerCredits.values());
  }

  /**
   * Determine slot cost based on time duration
   * Detects 2-hour slots and applies correct pricing
   */
  private static getSlotCost(time: string): number {
    // Check if this is a 2-hour slot
    // Common patterns for 2-hour slots:
    // - "19:00 - 21:00" (2-hour range)
    // - "19:00-21:00" (2-hour range)
    // - "19:00 to 21:00" (2-hour range)
    // - "19:00-21:00" (2-hour range)
    
    if (!time) return this.SLOT_COST_1H;
    
    const timeStr = time.toLowerCase().trim();
    
    // Check for 2-hour patterns
    const twoHourPatterns = [
      /(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/, // 19:00 - 21:00
      /(\d{1,2}):(\d{2})\s*to\s*(\d{1,2}):(\d{2})/,    // 19:00 to 21:00
      /(\d{1,2}):(\d{2})\s*until\s*(\d{1,2}):(\d{2})/, // 19:00 until 21:00
      /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/,     // 19:00-21:00
    ];
    
    for (const pattern of twoHourPatterns) {
      const match = timeStr.match(pattern);
      if (match) {
        const startHour = parseInt(match[1]);
        const startMinute = parseInt(match[2]);
        const endHour = parseInt(match[3]);
        const endMinute = parseInt(match[4]);
        
        // Calculate duration in hours
        const startTime = startHour + startMinute / 60;
        const endTime = endHour + endMinute / 60;
        const duration = endTime - startTime;
        
        // If duration is close to 2 hours (with some tolerance), charge 2-hour rate
        if (duration >= 1.8 && duration <= 2.2) {
          return this.SLOT_COST_2H;
        }
      }
    }
    
    // Default to 1-hour rate
    return this.SLOT_COST_1H;
  }

  /**
   * Simplify credits into optimal debt transactions using Splitwise algorithm
   * Respects user preferences for payment simplification
   */
  static simplifyCredits(credits: PlayerCredit[], userPreferences: UserSettlementPreferences = {}): SimplifiedDebt[] {
    if (credits.length === 0) return [];

    // Filter out players who have opted out of simplification (using smartSettle preference)
    const participatingCredits = credits.filter(credit => {
      const userPrefs = userPreferences[credit.playerName];
      return userPrefs?.smartSettle !== false; // Default to true if not set
    });

    if (participatingCredits.length === 0) return [];

    // Separate players with positive and negative credits
    const creditors = participatingCredits.filter(c => c.credits > 0).sort((a, b) => b.credits - a.credits);
    const debtors = participatingCredits.filter(c => c.credits < 0).sort((a, b) => a.credits - b.credits);

    const simplifiedDebts: SimplifiedDebt[] = [];

    // Use greedy algorithm to match creditors with debtors
    let creditorIndex = 0;
    let debtorIndex = 0;

    while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
      const creditor = creditors[creditorIndex];
      const debtor = debtors[debtorIndex];

      const amount = Math.min(creditor.credits, Math.abs(debtor.credits));

      if (amount > 0) {
        simplifiedDebts.push({
          fromPlayer: debtor.playerName,
          toPlayer: creditor.playerName,
          amount: parseFloat(amount.toFixed(2)),
          description: `${debtor.playerName} owes ${creditor.playerName} €${amount.toFixed(2)}`
        });
      }

      // Update remaining credits
      creditor.credits -= amount;
      debtor.credits += amount;

      // Move to next player if current one is fully settled
      if (creditor.credits <= 0.01) creditorIndex++;
      if (debtor.credits >= -0.01) debtorIndex++;
    }

    return simplifiedDebts;
  }

  /**
   * Main calculation method that combines all steps
   */
  static calculateSettlements(
    slots: any[],
    userPreferences: UserSettlementPreferences
  ): SimplifiedDebt[] {
    // Step 1: Calculate player credits (with filtering applied)
    const playerCredits = this.calculatePlayerCredits(slots, userPreferences);

    // Step 2: Simplify credits into optimal debts (respecting simplification preferences)
    const simplifiedDebts = this.simplifyCredits(playerCredits, userPreferences);

    return simplifiedDebts;
  }

  /**
   * Get settlement summary for a specific player
   */
  static getPlayerSettlementSummary(
    playerName: string,
    credits: PlayerCredit[]
  ): { owes: number; owed: number; netAmount: number } {
    const playerCredit = credits.find(c => c.playerName === playerName);
    
    if (!playerCredit) {
      return { owes: 0, owed: 0, netAmount: 0 };
    }

    if (playerCredit.credits > 0) {
      return {
        owes: 0,
        owed: playerCredit.credits,
        netAmount: playerCredit.credits
      };
    } else {
      return {
        owes: Math.abs(playerCredit.credits),
        owed: 0,
        netAmount: playerCredit.credits
      };
    }
  }

  /**
   * Get detailed credit breakdown for debugging
   */
  static getCreditBreakdown(slots: any[], userPreferences: UserSettlementPreferences = {}): {
    playerCredits: PlayerCredit[];
    summary: {
      totalSlots: number;
      eligibleSlots: number;
      totalCredits: number;
      totalDebits: number;
      netBalance: number;
    };
  } {
    const playerCredits = this.calculatePlayerCredits(slots, userPreferences);
    
    const totalSlots = slots.length;
    const eligibleSlots = slots.filter(s => 
      s.Settled !== 'yes' && 
      s.SwapRequested !== 'yes' && 
      ['claimed', 'reassigned', 'admin-reassigned'].includes(s.Status)
    ).length;

    const totalCredits = playerCredits
      .filter(c => c.credits > 0)
      .reduce((sum, c) => sum + c.credits, 0);
    
    const totalDebits = playerCredits
      .filter(c => c.credits < 0)
      .reduce((sum, c) => sum + Math.abs(c.credits), 0);

    return {
      playerCredits,
      summary: {
        totalSlots,
        eligibleSlots,
        totalCredits,
        totalDebits,
        netBalance: totalCredits - totalDebits
      }
    };
  }
}

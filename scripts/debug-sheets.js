#!/usr/bin/env node

import { getAllSlots, getUserMapping } from '../lib/googleSheets.js';

async function debugSheets() {
  try {
    console.log('🔍 Debugging Google Sheets data...\n');

    // Get user mapping using existing function
    const userMapping = await getUserMapping();
    
    console.log('📋 User Mapping Data (from existing function):');
    console.log('─'.repeat(80));
    
    for (const [playerName, userData] of Object.entries(userMapping)) {
      console.log(`${playerName.padEnd(15)} | ${userData.email.padEnd(25)} | ${userData.color?.padEnd(10) || 'N/A'.padEnd(10)} | ${userData.role?.padEnd(10) || 'N/A'.padEnd(10)} | smartSettle: ${userData.smartSettle}`);
      
      // Highlight Micha's row
      if (playerName.toLowerCase() === 'micha') {
        console.log(`   ⭐ MICHA'S DATA - smartSettle: ${userData.smartSettle}`);
      }
    }

    console.log('\n🔍 Testing settlement calculation with current logic:');
    console.log('─'.repeat(50));
    
    // Get all slots using existing function
    const slots = await getAllSlots();
    
    // Convert user mapping to preferences format
    const userPreferences = {};
    for (const [playerName, userData] of Object.entries(userMapping)) {
      userPreferences[playerName] = {
        smartSettle: userData.smartSettle,
        email: userData.email,
        color: userData.color,
        role: userData.role
      };
    }

    // Import and test settlement calculator
    const { SettlementCalculator } = await import('../lib/settlementCalculator.js');
    
    // Calculate settlements
    const settlements = SettlementCalculator.calculateSettlements(slots, userPreferences);
    
    // Get credit breakdown
    const creditBreakdown = SettlementCalculator.getCreditBreakdown(slots);
    
    // Find Micha's credit
    const michaCredit = creditBreakdown.playerCredits.find(c => c.playerName === 'Micha');
    
    console.log(`Micha's smartSettle preference: ${userPreferences['Micha']?.smartSettle}`);
    console.log(`Micha's credit: ${michaCredit ? michaCredit.credits : 'Not found'}`);
    console.log(`Micha's settlements: ${settlements.filter(s => s.fromPlayer === 'Micha' || s.toPlayer === 'Micha').length}`);
    
    // Show Micha's settlements
    const michaSettlements = settlements.filter(s => s.fromPlayer === 'Micha' || s.toPlayer === 'Micha');
    if (michaSettlements.length > 0) {
      console.log('\nMicha settlements:');
      michaSettlements.forEach(s => console.log(`  - ${s.description}`));
    } else {
      console.log('\nNo settlements for Micha (likely due to smartSettle: false)');
    }

  } catch (error) {
    console.error('❌ Error debugging sheets:', error.message);
  }
}

debugSheets();

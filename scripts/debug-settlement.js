#!/usr/bin/env node

const { getAllSlots, getUserMapping } = require('../lib/googleSheets.js');

async function debugSettlement() {
  try {
    console.log('🔍 Debugging settlement calculation...\n');

    // Get all slots and user mapping
    const [slots, userMapping] = await Promise.all([
      getAllSlots(),
      getUserMapping()
    ]);

    console.log(`📊 Total slots: ${slots.length}`);
    
    // Filter eligible slots
    const eligibleSlots = slots.filter(slot => {
      return slot.Settled !== 'yes' && 
             slot.SwapRequested !== 'yes' && 
             ['claimed', 'reassigned', 'admin-reassigned'].includes(slot.Status);
    });

    console.log(`✅ Eligible slots: ${eligibleSlots.length}`);

    // Check for slots with missing Player or ClaimedBy
    const slotsWithMissingData = eligibleSlots.filter(slot => {
      return !slot.Player || !slot.ClaimedBy || slot.Player === 'free spot';
    });

    console.log(`⚠️ Slots with missing data: ${slotsWithMissingData.length}`);
    
    if (slotsWithMissingData.length > 0) {
      console.log('\n📋 Sample slots with missing data:');
      slotsWithMissingData.slice(0, 5).forEach(slot => {
        console.log(`  - ID: ${slot.ID}, Player: "${slot.Player}", ClaimedBy: "${slot.ClaimedBy}", Time: "${slot.Time}"`);
      });
    }

    // Check time patterns
    const timePatterns = new Set();
    eligibleSlots.forEach(slot => {
      if (slot.Time) timePatterns.add(slot.Time);
    });

    console.log(`\n🕐 Unique time patterns: ${timePatterns.size}`);
    console.log('Sample time patterns:');
    Array.from(timePatterns).slice(0, 10).forEach(time => {
      console.log(`  - "${time}"`);
    });

  } catch (error) {
    console.error('❌ Error debugging settlement:', error.message);
  }
}

debugSettlement();

#!/usr/bin/env node

/**
 * Test script for settlement API endpoints
 * Run with: node scripts/test-settlement.js
 */

const BASE_URL = 'http://localhost:3000';

async function testAPI(endpoint, method = 'GET', body = null) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    console.log(`\n🔍 Testing: ${method} ${endpoint}`);
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    return { success: response.ok, data };
  } catch (error) {
    console.error(`❌ Error testing ${endpoint}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('🧪 Testing Simplified Settlement API Endpoints\n');

  // Test 1: Main settlement calculation
  await testAPI('/api/settlement/calculate');

  // Test 2: Debug endpoint (simplified)
  console.log('\n🔍 Detailed credit analysis:');
  const debugResult = await testAPI('/api/settlement/debug');
  
  if (debugResult.success && debugResult.data) {
    const data = debugResult.data;
    console.log(`📊 Total slots in sheet: ${data.totalSlots || 'N/A'}`);
    console.log(`✅ Eligible slots: ${data.eligibleSlots || 'N/A'}`);
    console.log(`💰 Total credits: €${data.creditSummary?.totalCredits || 'N/A'}`);
    console.log(`💸 Total debits: €${data.creditSummary?.totalDebits || 'N/A'}`);
    console.log(`⚖️ Net balance: €${data.creditSummary?.netBalance || 'N/A'}`);
    console.log(`🔄 Final settlements: ${data.settlements?.length || 0}`);
    
    // Show sample player credits
    if (data.playerCredits && data.playerCredits.length > 0) {
      console.log('\n📋 Sample player credits:');
      console.log(JSON.stringify(data.playerCredits.slice(0, 3), null, 2));
    }
  }

  // Test 3: Update user preference (replace 'Micha' with actual player name)
  await testAPI('/api/settlement/preferences', 'POST', {
    playerName: 'Micha',
    smartSettle: true
  });

  // Test 4: Get player-specific data (replace 'Micha' with actual player name)
  await testAPI('/api/settlement/user/Micha');

  // Test 5: Mark settlement complete (example)
  await testAPI('/api/settlement/mark-complete', 'POST', {
    fromPlayer: 'Player1',
    toPlayer: 'Player2',
    amount: 3.80
  });

  console.log('\n✅ Testing complete!');
}

// Run tests if this script is executed directly
runTests().catch(console.error);

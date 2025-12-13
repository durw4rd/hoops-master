import { NextRequest, NextResponse } from "next/server";
import { getUserMapping } from "@/lib/googleSheets";

/**
 * Admin Toggle API Route
 * 
 * Allows users with 'admin' role to toggle the LaunchDarkly 'admin-mode' flag
 * via webhook triggers. The flag controls admin functionality throughout the app.
 * 
 * Webhook URLs:
 * - Development: Used when NODE_ENV=development (local development)
 * - Production: Used when NODE_ENV=production (Vercel deployment)
 */

export async function POST(req: NextRequest) {
  try {
    const { action } = await req.json();
    
    if (!action || !['on', 'off'].includes(action)) {
      return NextResponse.json({ error: "Invalid action. Must be 'on' or 'off'." }, { status: 400 });
    }

    // Get the user's email from the request headers
    const userEmail = req.headers.get('x-user-email');
    
    if (!userEmail) {
      return NextResponse.json({ error: "User authentication required." }, { status: 401 });
    }

    // Check if user has admin role
    const userMapping = await getUserMapping();
    const playerName = Object.keys(userMapping).find(
      name => userMapping[name].email.toLowerCase() === userEmail.toLowerCase()
    );

    if (!playerName) {
      return NextResponse.json({ error: "Player not found in user mapping." }, { status: 404 });
    }

    const userRole = userMapping[playerName]?.role;
    if (userRole !== 'admin') {
      return NextResponse.json({ error: "Admin privileges required." }, { status: 403 });
    }

    // Determine environment and select appropriate webhook URL
    const isDevelopment = process.env.NODE_ENV === 'development';
    let webhookUrl: string;

    if (action === 'on') {
      // TURN ON admin mode webhook URLs
      webhookUrl = isDevelopment 
        ? 'https://app.launchdarkly.com/webhook/triggers/6890a2f3b625a40953b46653/d4627a1a-fa54-4ede-a7ae-72068fdcd37d'  // Development: Turn ON admin mode
        : 'https://app.launchdarkly.com/webhook/triggers/6890a34155b3f4093c873521/e7496f57-5dd9-49d1-a129-f02f68f27581'; // Production: Turn ON admin mode
    } else {
      // TURN OFF admin mode webhook URLs
      webhookUrl = isDevelopment
        ? 'https://app.launchdarkly.com/webhook/triggers/6890a32d84052b0957f62271/69930dc7-14ec-4214-b1cb-007fac5d29d8'  // Development: Turn OFF admin mode
        : 'https://app.launchdarkly.com/webhook/triggers/6890a34d4b429f095eec497a/752f5bd5-f126-4405-b5e9-bcd4d756731a'; // Production: Turn OFF admin mode
    }

    // Trigger the LaunchDarkly webhook
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        triggeredBy: userEmail,
        action: action,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!webhookResponse.ok) {
      console.error('LaunchDarkly webhook failed:', webhookResponse.status, webhookResponse.statusText);
      return NextResponse.json({ error: "Failed to trigger LaunchDarkly webhook." }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      action: action,
      message: `Admin mode ${action === 'on' ? 'enabled' : 'disabled'} successfully.`
    });

  } catch (err: any) {
    console.error('Admin toggle error:', err);
    return NextResponse.json({ error: err.message || "Unknown error." }, { status: 500 });
  }
} 
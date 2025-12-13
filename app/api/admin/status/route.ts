import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    // Get the user's email from the request headers
    const userEmail = req.headers.get('x-user-email');
    
    if (!userEmail) {
      return NextResponse.json({ 
        isAdmin: false, 
        error: "User authentication required." 
      }, { status: 401 });
    }

    // Admin status is controlled by LaunchDarkly 'admin-mode' flag on the client side
    // This endpoint is kept for potential future server-side admin validation
    // For now, we'll return the user email for client-side validation

    return NextResponse.json({ 
      isAdmin: false, // This should be determined by LaunchDarkly flag on client
      userEmail: userEmail,
      message: "Admin status is controlled by LaunchDarkly 'admin-mode' flag"
    });
  } catch (err: any) {
    return NextResponse.json({ 
      isAdmin: false,
      error: err.message || "Unknown error." 
    }, { status: 500 });
  }
} 
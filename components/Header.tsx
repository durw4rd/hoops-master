import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getOptimizedProfileImageForUser, handleProfileImageError } from "@/lib/utils";
import { useState, useEffect } from "react";

interface HeaderProps {
  session: any;
  onSignIn: () => void;
  onSignOut: () => void;
  userMapping?: Record<string, { email: string; color?: string; role?: string }>;
  adminMode?: boolean;
}

export default function Header({ session, onSignIn, onSignOut, userMapping, adminMode = false }: HeaderProps) {
  const loggedInUser = session?.user;
  const [isAdmin, setIsAdmin] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);

  // Check if current user has admin role
  useEffect(() => {
    if (loggedInUser?.email && userMapping) {
      const playerName = Object.keys(userMapping).find(
        name => userMapping[name].email.toLowerCase() === loggedInUser.email.toLowerCase()
      );
      const userRole = playerName ? userMapping[playerName]?.role : undefined;
      setIsAdmin(userRole === 'admin');
    }
  }, [loggedInUser?.email, userMapping]);

  const handleAdminToggle = async (enabled: boolean) => {
    if (!loggedInUser?.email) return;
    
    setToggleLoading(true);
    try {
      const response = await fetch('/api/admin/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': loggedInUser.email,
        },
        body: JSON.stringify({
          action: enabled ? 'on' : 'off'
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Admin toggle failed:', error);
        // Revert the switch state on error
        return;
      }

      // Success - the LaunchDarkly flag will update automatically
      console.log(`Admin mode ${enabled ? 'enabled' : 'disabled'} successfully`);
    } catch (error) {
      console.error('Admin toggle error:', error);
      // Revert the switch state on error
    } finally {
      setToggleLoading(false);
    }
  };

  return (
    <div className="bg-white border-b border-orange-200 sticky top-0 z-50">
      <div className="max-w-md mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src="/optimized/summerHoopsLogo.png" alt="Summer Hoops Logo" className="w-12 h-12 rounded-full" />
            <div>
              <h1
                className="text-2xl font-extrabold bg-gradient-to-r from-[#4CAF50] via-[#FFD600] to-[#FB8C00] bg-clip-text text-transparent drop-shadow-sm"
                style={{ letterSpacing: '0.03em' }}
              >
                Summer Hoops
              </h1>
              {!loggedInUser && (
                <p className="text-xs text-gray-500">Please log in</p>
              )}
              {adminMode && (
                <div className="flex items-center space-x-1">
                  <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-medium">
                    🔧 Admin Mode
                  </span>
                </div>
              )}
              {isAdmin && (
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-xs text-gray-600">Admin Mode:</span>
                  <Switch
                    checked={adminMode}
                    onCheckedChange={handleAdminToggle}
                    disabled={toggleLoading}
                    className="scale-75"
                  />
                  {toggleLoading && (
                    <span className="text-xs text-gray-500">...</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {loggedInUser ? (
              <>
                <Avatar className="w-8 h-8">
                  <AvatarImage 
                    src={getOptimizedProfileImageForUser(loggedInUser.email, userMapping || {})} 
                    alt={loggedInUser.name || "User"} 
                    onError={(e) => handleProfileImageError(e)} 
                  />
                  <AvatarFallback>
                    {loggedInUser.name
                      ?.split(" ")
                      .map((n: string) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <Button size="sm" variant="outline" onClick={onSignOut}>Logout</Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={onSignIn}>Login with Google</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 
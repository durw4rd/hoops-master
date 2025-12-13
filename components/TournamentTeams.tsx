"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Users } from "lucide-react";
import { TournamentTeam } from "@/lib/googleSheets";
import { getOptimizedProfileImage, handleProfileImageError } from "@/lib/utils";

interface TournamentTeamsProps {
  teams: TournamentTeam[];
  userMapping: Record<string, { email: string; color?: string; role?: string }>;
}

const teamColors = [
  "bg-red-500",
  "bg-blue-500", 
  "bg-green-500",
  "bg-yellow-500"
];

const teamGradients = [
  "from-red-400 to-red-600",
  "from-blue-400 to-blue-600",
  "from-green-400 to-green-600", 
  "from-yellow-400 to-yellow-600"
];

export default function TournamentTeams({ teams, userMapping }: TournamentTeamsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!teams || teams.length === 0) {
    return null;
  }

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="mt-6 space-y-4">
      {/* Tournament Teams Header with Toggle */}
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <h3 className="text-2xl font-extrabold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent flex items-center gap-2">
            <span role="img" aria-label="trophy">🏆</span>
            TOURNAMENT TEAMS
            <span role="img" aria-label="fire">🔥</span>
          </h3>
        </div>
        <p className="text-sm text-gray-600 mb-3">The battle lines are drawn!</p>
        
        {/* Toggle Button */}
        <Button
          onClick={toggleExpanded}
          variant="outline"
          size="sm"
          className="bg-gradient-to-r from-yellow-100 to-orange-100 border-yellow-300 hover:from-yellow-200 hover:to-orange-200 text-yellow-800 font-semibold"
        >
          <Users className="w-4 h-4 mr-2" />
          {isExpanded ? 'Hide Teams' : 'Show Teams'}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 ml-2" />
          ) : (
            <ChevronDown className="w-4 h-4 ml-2" />
          )}
        </Button>
      </div>

      {/* Teams Grid - Collapsible */}
      {isExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teams.map((team, index) => (
            <Card 
              key={team.name}
              className={`border-2 shadow-lg hover:shadow-xl transition-all duration-300 ${
                index === 0 ? 'border-red-300 bg-gradient-to-br from-red-50 to-red-100' :
                index === 1 ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-blue-100' :
                index === 2 ? 'border-green-300 bg-gradient-to-br from-green-50 to-green-100' :
                'border-yellow-300 bg-gradient-to-br from-yellow-50 to-yellow-100'
              }`}
            >
              <CardHeader className="pb-3">
                <CardTitle className={`text-lg font-bold text-center flex items-center justify-center gap-2 ${
                  index === 0 ? 'text-red-700' :
                  index === 1 ? 'text-blue-700' :
                  index === 2 ? 'text-green-700' :
                  'text-yellow-700'
                }`}>
                  <div className={`w-4 h-4 rounded-full ${teamColors[index]} animate-pulse`}></div>
                  {team.name}
                  <div className={`w-4 h-4 rounded-full ${teamColors[index]} animate-pulse`}></div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {team.players.map((player, playerIndex) => (
                  <div 
                    key={player}
                    className="flex items-center gap-3 p-2 rounded-lg bg-white/70 hover:bg-white/90 transition-colors duration-200"
                  >
                    <Avatar className="w-8 h-8 border-2 border-white shadow-md">
                      <AvatarImage
                        src={getOptimizedProfileImage(player)}
                        onError={(e) => handleProfileImageError(e, player)}
                      />
                      <AvatarFallback className="text-xs font-medium">
                        {player.split(" ").map((n: string) => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-gray-800 flex-1">
                      {player}
                    </span>
                    <Badge 
                      variant="secondary" 
                      className={`text-xs ${
                        index === 0 ? 'bg-red-200 text-red-800' :
                        index === 1 ? 'bg-blue-200 text-blue-800' :
                        index === 2 ? 'bg-green-200 text-green-800' :
                        'bg-yellow-200 text-yellow-800'
                      }`}
                    >
                      #{playerIndex + 1}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

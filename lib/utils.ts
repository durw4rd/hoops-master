import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getDayOfWeek(dateStr: string) {
  const [day, month] = dateStr.split('.').map(Number);
  const date = new Date(new Date().getFullYear(), month - 1, day);
  return date.toLocaleDateString(undefined, { weekday: 'short' }); // e.g., 'Mon', 'Tue'
}

export function compareSlotsByDateTime(a: { Date: string, Time: string }, b: { Date: string, Time: string }) {
  // Date format: DD.MM, Time format: HH:MM - HH:MM
  const [dayA, monthA] = a.Date.split('.').map(Number);
  const [dayB, monthB] = b.Date.split('.').map(Number);
  const dateA = new Date(new Date().getFullYear(), monthA - 1, dayA);
  const dateB = new Date(new Date().getFullYear(), monthB - 1, dayB);
  if (dateA < dateB) return -1;
  if (dateA > dateB) return 1;
  // If dates are equal, compare start time (HH:MM)
  const startTimeA = a.Time.split('-')[0].trim();
  const startTimeB = b.Time.split('-')[0].trim();
  const [hourA, minA] = startTimeA.split(':').map(Number);
  const [hourB, minB] = startTimeB.split(':').map(Number);
  if (hourA !== hourB) return hourA - hourB;
  return minA - minB;
}

export function getDeviceType(): 'mobile' | 'desktop' {
  if (typeof window === 'undefined') {
    return 'desktop'; // Default for SSR
  }
  
  // Check for mobile devices using user agent and screen size
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  const isTablet = /ipad|android(?=.*\b(?!.*mobile))/i.test(userAgent);
  
  // Additional check for viewport size - modern phones can have larger screens
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const isSmallScreen = viewportWidth <= 1024 || viewportHeight <= 1024;
  
  // Consider it mobile if it's a mobile device OR has a small screen
  if (isMobile || isSmallScreen) {
    return 'mobile';
  }
  
  // Consider tablets as mobile for this use case
  if (isTablet) {
    return 'mobile';
  }
  
  return 'desktop';
}

// Browser detection utilities for performance optimization
export function detectBrowser() {
  if (typeof window === 'undefined') {
    return { isBrave: false, isChrome: false, isFirefox: false, isSafari: false };
  }

  const userAgent = navigator.userAgent;
  const isBrave = (navigator as any).brave?.isBrave?.() || 
                  userAgent.includes('Brave') ||
                  (navigator as any).brave;
  const isChrome = userAgent.includes('Chrome') && !userAgent.includes('Brave');
  const isFirefox = userAgent.includes('Firefox');
  const isSafari = userAgent.includes('Safari') && !userAgent.includes('Chrome');

  return {
    isBrave: Boolean(isBrave),
    isChrome: Boolean(isChrome),
    isFirefox: Boolean(isFirefox),
    isSafari: Boolean(isSafari)
  };
}

// Performance optimization helper
export function shouldOptimizeForPerformance(): boolean {
  const { isBrave } = detectBrowser();
  
  // Optimize for Brave browser due to known performance issues with session replay
  if (isBrave) {
    return true;
  }
  
  // Additional checks for low-end devices
  if (typeof window !== 'undefined') {
    const memory = (navigator as any).deviceMemory;
    const cores = (navigator as any).hardwareConcurrency;
    
    // Optimize for devices with limited resources
    if (memory && memory < 4) return true; // Less than 4GB RAM
    if (cores && cores < 4) return true; // Less than 4 CPU cores
  }
  
  return false;
}

// Optimized profile image loading utility
export function getOptimizedProfileImage(playerName: string): string {
  if (!playerName) return '/optimized/profile-default.png';
  
  // Clean the player name for filename
  const cleanName = playerName.replace(/\s+/g, "").toLowerCase();
  
  // Check if player name ends with 'bot' and use bot profile image
  if (cleanName.endsWith('bot')) {
    return '/optimized/profile-bot.png';
  }
  
  // Try optimized image first, fallback to original
  return `/optimized/profile-${cleanName}.png`;
}

// Get optimized profile image for Google OAuth user by mapping email to basketball player name
export function getOptimizedProfileImageForUser(userEmail: string, userMapping: Record<string, { email: string; color?: string; role?: string }>): string {
  if (!userEmail || !userMapping) return '/optimized/profile-default.png';
  
  // Find the basketball player name that matches this email
  const playerName = Object.keys(userMapping).find(
    name => userMapping[name].email.toLowerCase() === userEmail.toLowerCase()
  );
  
  if (!playerName) return '/optimized/profile-default.png';
  
  // Return the optimized profile image for this basketball player
  return getOptimizedProfileImage(playerName);
}

// Profile image error handler with fallback chain
export function handleProfileImageError(event: React.SyntheticEvent<HTMLImageElement, Event>, playerName?: string) {
  const img = event.currentTarget;
  const currentSrc = img.src;
  
  // Fallback chain: optimized -> original -> default
  if (currentSrc.includes('/optimized/')) {
    // If optimized image failed, try original
    const originalSrc = currentSrc.replace('/optimized/', '/');
    img.src = originalSrc;
  } else if (currentSrc.includes('/profile-') && !currentSrc.includes('/profile-default.png')) {
    // If original image failed, use default
    img.src = '/optimized/profile-default.png';
  } else if (currentSrc.includes('/profile-default.png')) {
    // If optimized default failed, try original default
    img.src = '/profile-default.png';
  }
}

// Shared date normalization function to ensure consistency across components
export function normalizeDate(date: string): string {
  if (!date) return '';
  const [d, m] = date.split('.').map(Number);
  if (isNaN(d) || isNaN(m)) return date.trim();
  return `${d.toString().padStart(2, '0')}.${m.toString().padStart(2, '0')}`;
}

export function isSessionInPast(date: string): boolean {
  const [day, month] = date.split('.').map(Number);
  const eventDate = new Date(new Date().getFullYear(), month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time to start of day for comparison
  return eventDate < today;
}

export function shouldSlotBeExpired(date: string, time: string): boolean {
  const [day, month] = date.split('.').map(Number);
  
  // Handle time format: "HH:MM - HH:MM" - we need the end time
  const endTime = time.split('-')[1].trim();
  const [hours, minutes] = endTime.split(':').map(Number);
  
  // Create event date with end time
  const eventDate = new Date(new Date().getFullYear(), month - 1, day, hours, minutes);
  
  // Add 1 hour to the event end time to determine when it should expire
  const expiryDate = new Date(eventDate.getTime() + 60 * 60 * 1000);
  
  const now = new Date();
  return now > expiryDate;
}

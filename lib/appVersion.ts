import packageJson from '../package.json';

/** Single source of truth for app version (package.json). */
export const APP_ID = packageJson.name;
export const APP_NAME = 'Hoops Master';
export const APP_VERSION = packageJson.version;

/**
 * Deploy-unique build id (Vercel commit SHA; 'dev' locally). Changes every
 * deploy even when the semver doesn't, so the upgrade banner can detect a tab
 * running an older bundle than the live deployment. See next.config.mjs.
 */
export const APP_BUILD_ID = process.env.NEXT_PUBLIC_APP_BUILD_ID || 'dev';

export const ldApplicationMetadata = {
  id: APP_ID,
  name: APP_NAME,
  version: APP_VERSION,
  versionName: `v${APP_VERSION}`,
} as const;

import packageJson from '../package.json';

/** Single source of truth for app version (package.json). */
export const APP_ID = packageJson.name;
export const APP_NAME = 'Hoops Master';
export const APP_VERSION = packageJson.version;

export const ldApplicationMetadata = {
  id: APP_ID,
  name: APP_NAME,
  version: APP_VERSION,
  versionName: `v${APP_VERSION}`,
} as const;

const { notarize } = require('@electron/notarize');
require('dotenv').config();

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const nodeEnvRaw = process.env.NODE_ENV ?? '';
  if (nodeEnvRaw.trim().toLowerCase() !== 'production') {
    console.warn(`Skipping notarization: NODE_ENV=${nodeEnvRaw}`);
    return;
  }

  const skipNotarizeRaw = process.env.SKIP_NOTARIZE ?? '';
  if (['1', 'true', 'yes', 'on'].includes(skipNotarizeRaw.trim().toLowerCase())) {
    console.warn(`Skipping notarization: SKIP_NOTARIZE=${skipNotarizeRaw}`);
    return;
  }

  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD) {
    console.warn('Skipping notarization: APPLE_ID or APPLE_APP_SPECIFIC_PASSWORD not set');
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  return await notarize({
    appBundleId: 'com.anicca.app',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID
  });
};

/** @type {import('expo/config').ExpoConfig} */
const appJson = require('./app.json');

const universalHost = 'app.carahulgupta.in';
const easProjectId = process.env.EAS_PROJECT_ID || process.env.EXPO_PUBLIC_EAS_PROJECT_ID || '';

module.exports = () => ({
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra || {}),
      eas: {
        ...(appJson.expo.extra?.eas || {}),
        ...(easProjectId ? { projectId: easProjectId } : {}),
      },
    },
    ios: {
      ...appJson.expo.ios,
      associatedDomains: [`applinks:${universalHost}`],
    },
    android: {
      ...appJson.expo.android,
      intentFilters: [
        ...(appJson.expo.android?.intentFilters || []),
        {
          action: 'VIEW',
          autoVerify: true,
          data: [{ scheme: 'https', host: universalHost, pathPrefix: '/' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
  },
});

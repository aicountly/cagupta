import * as Linking from 'expo-linking';

import { MOBILE_APP_SCHEME, MOBILE_UNIVERSAL_LINK_HOSTS } from '@cagupta/shared-constants';

/** URL prefixes handled by the app (custom scheme + Universal Links + Expo dev URLs). */
export const linkingPrefixes = [
  Linking.createURL('/'),
  `${MOBILE_APP_SCHEME}://`,
  ...MOBILE_UNIVERSAL_LINK_HOSTS.map((host) => `https://${host}`),
];



/**

 * Minimal React Navigation linking config.

 * Route targets are resolved imperatively via DeepLinkContext for multi-portal routing.

 */

export const linking = {

  prefixes: linkingPrefixes,

  config: {

    screens: {

      Login: 'login',

      App: 'app',

    },

  },

};


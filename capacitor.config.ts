import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tabby.app',
  appName: 'Tabby',
  webDir: 'dist',
  server: {
    url: 'https://mytabby.netlify.app/',
    cleartext: true
  },
  android: {
    allowMixedContent: true
  }
};

export default config;

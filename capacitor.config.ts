import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tabby.app',
  appName: 'Tabby',
  webDir: 'dist',
  server: {
    // UNCOMMENT & REPLACE with your hosted URL (e.g. Firebase, Vercel) for INSTANT LIVE UPDATES:
    // url: 'https://your-tabby-app.web.app',
    // cleartext: true
  },
  android: {
    allowMixedContent: true
  }
};

export default config;

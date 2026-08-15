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
    allowMixedContent: true,
    backgroundColor: '#F8F5F2',
    captureInput: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#F8F5F2',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#3C5A48',
      overlaysWebView: false
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK'
    },
    CapacitorUpdater: {
      autoUpdate: true
    }
  }
};

export default config;


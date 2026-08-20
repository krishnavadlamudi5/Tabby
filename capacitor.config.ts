import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tabby.app',
  appName: 'Tabby',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    backgroundColor: '#FAF8F5',
    captureInput: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#FAF8F5',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
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
      autoUpdate: false,
      statsUrl: ''
    }
  }
};

export default config;

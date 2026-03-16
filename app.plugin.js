// Simple config plugin to add SMS permissions for Android builds.

const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withSmsPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    const existing =
      androidManifest.manifest['uses-permission'] || [];

    const ensurePermission = (name) => {
      if (!existing.find((p) => p.$['android:name'] === name)) {
        existing.push({ $: { 'android:name': name } });
      }
    };

    ensurePermission('android.permission.READ_SMS');
    ensurePermission('android.permission.RECEIVE_SMS');

    androidManifest.manifest['uses-permission'] = existing;
    return config;
  });
};


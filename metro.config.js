const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Polyfill Node.js built-ins required by iconv-lite (native only)
config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    ...config.resolver?.extraNodeModules,
    string_decoder: path.resolve(__dirname, 'node_modules/string_decoder'),
  },
  // Exclude native-only modules from web bundle
  resolverMainFields: ['react-native', 'browser', 'main'],
};

module.exports = config;

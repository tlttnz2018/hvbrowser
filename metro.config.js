const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

// Polyfill Node.js built-ins required by iconv-lite (native only)
config.resolver = {
  ...config.resolver,
  assetExts: Array.from(new Set([...(config.resolver?.assetExts ?? []), 'db', 'sqlite'])),
  extraNodeModules: {
    ...config.resolver?.extraNodeModules,
    string_decoder: path.resolve(__dirname, 'node_modules/string_decoder'),
  },
  // Exclude native-only modules from web bundle
  resolverMainFields: ['react-native', 'browser', 'main'],
};

module.exports = config;

const { getDefaultConfig } = require('expo/metro-config');

// Plain Metro config — no NativeWind wrapper needed.
// We'll revisit NativeWind when Windows compatibility improves.
const config = getDefaultConfig(__dirname);

module.exports = config;

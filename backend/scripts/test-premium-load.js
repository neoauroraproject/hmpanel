const path = require('path');
process.env.HMPANEL_DIST = path.join(__dirname, '..', 'dist');
const bundle =
  process.argv[2] ||
  path.resolve(__dirname, '../../../Panel - Premium/dist-bundle/premium-bundle-1.5.6/backend/index.js');

(async () => {
  try {
    const mod = await import(bundle);
    console.log('PremiumBundleModule:', !!mod.PremiumBundleModule);
  } catch (e) {
    console.error('LOAD FAILED:', e.message);
    console.error(e.stack?.split('\n').slice(0, 10).join('\n'));
    process.exit(1);
  }
})();

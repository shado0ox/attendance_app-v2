import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const stub = resolve(import.meta.dirname, 'native-stubs.tsx');
export default {
  root: import.meta.dirname,
  esbuild: { tsconfigRaw: '{"compilerOptions":{"jsx":"react-jsx","target":"ESNext"}}' },
  optimizeDeps: { esbuildOptions: { tsconfigRaw: '{"compilerOptions":{"jsx":"react-jsx"}}' } },
  plugins: [{ name: 'native-layout-fixtures', enforce: 'pre', resolveId(id: string) {
    if (id === 'expo-router' || id === 'expo-router/react-navigation' || id === 'expo-location' || id === 'expo-linking' || /\/lib\/(session|backgroundLocation|gps|passkey|api)$/.test(id) || id === 'react-native-reanimated' || id === 'react-native-safe-area-context') return stub;
  } }],
  resolve: { alias: [
    { find: /^react-native$/, replacement: resolve(import.meta.dirname,'native-adapter.tsx') },
    { find: /^react-native-web$/, replacement: resolve(root,'node_modules/react-native-web/dist/index.js') },
    { find: /^react-native-svg$/, replacement: resolve(import.meta.dirname,'svg-adapter.tsx') },
    { find: /^react$/, replacement: resolve(root,'node_modules/react') },
    { find: /^react-dom/, replacement: resolve(root,'node_modules/react-dom') },
  ], extensions: ['.web.tsx','.web.ts','.web.js','.tsx','.ts','.jsx','.js','.json'] },
  server: { host:'127.0.0.1',port:5178,strictPort:true,fs:{allow:[root,resolve(root,'..')]} },
};

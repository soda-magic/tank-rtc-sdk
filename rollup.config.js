import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import strip from '@rollup/plugin-strip';

export default [
  // ES6 Module build
  {
    input: 'src/index.js',
    output: {
      file: 'dist/tank-rtc-sdk.esm.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [
      nodeResolve(),
      commonjs()
    ],
    external: []
  },

  // UMD build (minified, with logs stripped)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/tank-rtc-sdk.umd.js',
      format: 'umd',
      name: 'TankRTC',
      sourcemap: true
    },
    plugins: [
      nodeResolve(),
      commonjs(),
      strip({
        include: '**/*.(js|ts)',
        functions: ['console.*', 'assert.*'],
        debugger: true
      }),
      terser()
    ],
    external: []
  },

  // UMD build (unminified for development)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/tank-rtc-sdk.umd.dev.js',
      format: 'umd',
      name: 'TankRTC',
      sourcemap: true
    },
    plugins: [
      nodeResolve(),
      commonjs()
    ],
    external: []
  }
];

import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

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
  // UMD build (minified)
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
import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const fixture = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(fixture, '../..');
export default defineConfig({root:fixture,envDir:false,resolve:{alias:{
  '../actions/display-names':path.join(fixture,'actions.js'),
  '@/features/employees/actions':path.join(fixture,'actions.js'),
  'next/navigation':path.join(fixture,'navigation.js'),
  'next/link':path.join(fixture,'link.jsx'),
  '@':path.join(repo,'src'),
  'react-dom/client':path.join(repo,'node_modules/react-dom/client.js'),
  'react':path.join(repo,'node_modules/react')
}},server:{host:'127.0.0.1',port:3128,strictPort:true,fs:{allow:[repo]}},oxc:{jsx:{runtime:'automatic'}}});

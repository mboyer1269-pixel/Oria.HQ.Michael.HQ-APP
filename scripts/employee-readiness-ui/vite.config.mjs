import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import tailwind from '@tailwindcss/postcss';
const fixture = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(fixture, '../..');
export default defineConfig({root:fixture,envDir:false,plugins:[{name:'readiness-local-fonts',enforce:'pre',transform(code,id){if(id.endsWith('/src/app/globals.css')) return code.replace(/@import\s+url\([^\n]+\);/g,'');}}],css:{postcss:{plugins:[tailwind()]}},resolve:{alias:{
  '@/features/employees/actions':path.join(fixture,'actions.js'),
  '@':path.join(repo,'src'),
  'react-dom/client':path.join(repo,'node_modules/react-dom/client.js'),
  'react':path.join(repo,'node_modules/react')
}},server:{host:'127.0.0.1',port:3138,strictPort:true,fs:{allow:[repo]}},oxc:{jsx:{runtime:'automatic'}}});

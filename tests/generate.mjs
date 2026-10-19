import fs from 'node:fs';
import path from 'node:path';
import {templates,generate} from './helpers.mjs';
const dir=path.resolve(process.argv[2]??'.test-output/generated');
fs.mkdirSync(dir,{recursive:true});
for(const f of templates){fs.writeFileSync(path.join(dir,f),JSON.stringify(await generate(f),null,2)+'\n');}
console.log('Generated six fixture configurations in '+dir);

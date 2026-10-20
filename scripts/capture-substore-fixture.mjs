// Optional offline regeneration: pass a locally downloaded, pinned official bundle.
// No Sub-Store server, subscription URL, dependencies, credentials or network access.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const expected='599ed6ae6570c17939282f2f2a6fa28b204fdc1fd36faf6ae9b534588f26c80f';
const source=fs.readFileSync(process.argv[2]??'proxy-utils.esm.mjs');
if(crypto.createHash('sha256').update(source).digest('hex')!==expected)throw Error('Expected official Sub-Store 2.42.6 proxy-utils.esm.mjs SHA256');
const prefs=new Map(),logs=[];
const context=vm.createContext({TextEncoder,TextDecoder,setTimeout,clearTimeout,
 console:{log:(...v)=>logs.push(v.join(' ')),warn:(...v)=>logs.push(v.join(' ')),error:(...v)=>logs.push(v.join(' '))},
 $task:{fetch(){throw Error('Fixture network access is forbidden')}},
 $prefs:{valueForKey:k=>prefs.get(k),setValueForKey:(v,k)=>{prefs.set(k,v);return true}},$notify(){}});
const module=new vm.SourceTextModule(source.toString(),{context});
await module.link(()=>{throw Error('Fixture external imports are forbidden')});await module.evaluate({timeout:10000});
const inputPath=path.join(root,'tests/fixtures/substore-input.json'),input=fs.readFileSync(inputPath,'utf8').replace(/\r\n/g,'\n');
const data=JSON.parse(input);
context.parse=module.namespace.parse;context.produce=module.namespace.produce;
const convert=nodes=>{
 context.raw=nodes.map(n=>JSON.stringify(n)).join('\n');
 return vm.runInContext("produce(parse(raw),'sing-box','external',{'include-unsupported-proxy':false})",context,{timeout:10000});
};
const output={provenance:{release:'2.42.6',commit:'1f0318bc6feb46fbe204836f32ca7acab37ea67e',
 url:'https://github.com/sub-store-org/Sub-Store/releases/download/2.42.6/proxy-utils.esm.mjs',sha256:expected,
 input_sha256:crypto.createHash('sha256').update(input).digest('hex'),input_hash_normalization:'UTF-8, CRLF normalized to LF',
 scope:'Unmodified official parse + produce; in-memory QX host storage, network denied; not a live backend integration'},
 combined:convert([...data.airport,...data.vps]),vps:convert(data.vps),
 renamedCombined:convert([...data.airport,...data.vps.map(n=>({...n,name:'集合 / '+n.name}))])};
fs.writeFileSync(path.join(root,'tests/fixtures/substore-2.42.6.json'),JSON.stringify(output,null,2)+'\n');
console.log('Captured official Sub-Store parser/producer output; logs: '+logs.length);

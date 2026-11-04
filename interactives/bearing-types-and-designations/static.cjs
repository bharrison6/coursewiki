'use strict';
// One renderer owns the live illustrations, complete static lessons and reusable SVGs.
const fs=require('node:fs'),path=require('node:path'),M=require('./model.js'),D=require('./render.js');
const repo=path.resolve(__dirname,'../..'),write=process.argv.includes('--write');let stale=[];
function output(file,content){if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===content)return;if(write){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}else stale.push(path.relative(repo,file));}
for(const [name,page,make] of [
 ['BEARING-FAMILY-ATLAS','bearing-types-and-loads',D.atlas],
 ['BEARING-CATALOG-SIZES','bearing-designations-and-sizes',D.staticSizes]
]){
 const file=path.join(repo,'collections/engineering/pages',page+'.html'),src=fs.readFileSync(file,'utf8'),start='<!-- '+name+' -->',end='<!-- /'+name+' -->';
 const a=src.indexOf(start),b=src.indexOf(end);if(a<0||b<a||src.indexOf(start,a+1)>=0)throw Error('Unique ordered markers required: '+name);
 output(file,src.slice(0,a+start.length)+'\n'+make()+'\n'+src.slice(b));
}
for(const f of M.families)output(path.join(repo,'media/power-transmission/bearings',f.id+'.svg'),D.familySvg(f)+'\n');
output(path.join(repo,'media/power-transmission/bearings/mounted-housings.svg'),D.mountedSvg()+'\n');
if(stale.length){console.error('Regenerate bearing sources: '+stale.join(', '));process.exitCode=1;}else console.log(write?'Bearing figures/static lessons generated.':'Bearing figures/static lessons match.');

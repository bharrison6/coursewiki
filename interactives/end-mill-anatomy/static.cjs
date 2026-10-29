'use strict';
const fs=require('node:fs'),path=require('node:path'),D=require('./render.js');
const file=path.resolve(__dirname,'../../collections/machining/pages/milling-cutter-selection.html');
const start='<!-- END-MILL-ANATOMY-STATIC -->',end='<!-- /END-MILL-ANATOMY-STATIC -->';
const source=fs.readFileSync(file,'utf8'),a=source.indexOf(start),b=source.indexOf(end);
if(a<0||b<=a)throw new Error('Static anatomy markers must occur in order');
const output=source.slice(0,a+start.length)+'\n      '+D.staticLesson()+'\n      '+source.slice(b);
if(process.argv.includes('--write'))fs.writeFileSync(file,output);
else if(output!==source){console.error('End-mill anatomy static lesson needs regeneration.');process.exitCode=1;}
else console.log('End-mill anatomy static lesson matches the shared renderer.');

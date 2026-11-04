'use strict';
const fs=require('node:fs'),path=require('node:path'),D=require('./render.js');
const file=path.resolve(__dirname,'../../collections/engineering/pages/backlash-and-lost-motion.html');
const text=fs.readFileSync(file,'utf8'),start='<!-- BACKLASH-MILLING-STATIC -->',end='<!-- /BACKLASH-MILLING-STATIC -->',a=text.indexOf(start),b=text.indexOf(end);
if(a<0||b<=a)throw new Error('Expected one ordered pair of static markers.');
const updated=text.slice(0,a+start.length)+'\n    <div class="bme-static">'+D.staticLesson()+'</div>\n    '+text.slice(b);
if(process.argv.includes('--write')){fs.writeFileSync(file,updated);console.log('Milling backlash static lesson written.');}else if(updated!==text){console.error('Milling backlash static lesson needs regeneration.');process.exitCode=1;}else console.log('Milling backlash static lesson matches.');

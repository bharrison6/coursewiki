'use strict';
// The preserved Blender review directory is an input, never modified by this script.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const review=process.argv[2];
if(!review)throw new Error('Usage: node bake-approved-asset.cjs <preserved review-v6 directory>');
const bytes=fs.readFileSync(path.join(review,'endmill.glb'));
const hash=crypto.createHash('sha256').update(bytes).digest('hex');
if(hash!=='aebcd74d18929c42ce7465f9df8ea1c17598043a1b03912360e4631526277022')throw new Error('The approved GLB identity changed');
const spec=JSON.parse(fs.readFileSync(path.join(review,'specification.json'),'utf8').replace(/^\uFEFF/,''));
const asset={version:'review-v6',sha256:hash,byteLength:bytes.length,specification:spec.specification,anchors:spec.anchors_blender_mm,lead_mm:spec.lead_mm,base64:bytes.toString('base64')};
fs.writeFileSync(path.join(__dirname,'approved-asset.js'),'/* Generated from the preserved, user-approved Blender review-v6 GLB and specification. */\n(function(r){var a='+JSON.stringify(asset)+';if(typeof module==="object"&&module.exports)module.exports=a;else r.CourseWikiApprovedEndMill=a;})(typeof globalThis!=="undefined"?globalThis:this);\n');
console.log('Approved asset: '+hash+'; '+bytes.length+' bytes');

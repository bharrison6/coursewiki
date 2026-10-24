/* A tangible nominal guide from the existing inspection-derived height field.
   No target dimensions or machining rules are repeated here. The target's XY
   display pitch is the supplied field pitch (currently 0.25 mm). Flat floors
   and explicit vertical sides retain their Z; through columns have no lid.
   This sampled guide is separate from the analytic cut mesh and assessment. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CourseWikiMillingTargetMesh=api;}(typeof self!=='undefined'?self:this,function(){
  'use strict';
  function build(field,nx,ny,stock){
    var dx=(stock.x1-stock.x0)/nx,dy=(stock.y1-stock.y0)/ny,positions=[],edges=[],used=new Uint8Array(nx*ny);
    function h(i,j){return i<0||j<0||i>=nx||j>=ny?stock.bottom:field[i+j*nx];}
    function x(i){return stock.x0+i*dx;}function y(j){return stock.y0+j*dy;}
    function quad(a,b,c,d){positions.push.apply(positions,a.concat(b,c,a,c,d));}
    for(var j=0;j<ny;j++)for(var i=0;i<nx;i++){
      var z=h(i,j),key=i+j*nx;if(used[key]||z<=stock.bottom+1e-7)continue;
      var w=1,tall=1;while(i+w<nx&&!used[key+w]&&h(i+w,j)===z)w++;
      outer:while(j+tall<ny){for(var k=0;k<w;k++)if(used[i+k+(j+tall)*nx]||h(i+k,j+tall)!==z)break outer;tall++;}
      for(var yy=0;yy<tall;yy++)for(var xx=0;xx<w;xx++)used[i+xx+(j+yy)*nx]=1;
      quad([x(i),y(j),z],[x(i+w),y(j),z],[x(i+w),y(j+tall),z],[x(i),y(j+tall),z]);
      quad([x(i),y(j+tall),stock.bottom],[x(i+w),y(j+tall),stock.bottom],[x(i+w),y(j),stock.bottom],[x(i),y(j),stock.bottom]);
    }
    function wall(a,b,lo,hi){if(hi<=stock.bottom+1e-7||hi-lo<1e-8)return;quad(a.concat(lo),b.concat(lo),b.concat(hi),a.concat(hi));edges.push.apply(edges,a.concat(hi,b,hi,a,lo,b,lo));}
    for(var i=0;i<=nx;i++)for(var j=0;j<ny;){var a=h(i-1,j),b=h(i,j),end=j+1;while(end<ny&&h(i-1,end)===a&&h(i,end)===b)end++;wall([x(i),y(j)],[x(i),y(end)],Math.min(a,b),Math.max(a,b));j=end;}
    for(var j=0;j<=ny;j++)for(var i=0;i<nx;){var a=h(i,j-1),b=h(i,j),end=i+1;while(end<nx&&h(end,j-1)===a&&h(end,j)===b)end++;wall([x(i),y(j)],[x(end),y(j)],Math.min(a,b),Math.max(a,b));i=end;}
    return{positions:new Float32Array(positions),edges:new Float32Array(edges),pitch:[dx,dy],triangles:positions.length/9};
  }
  return{build:build};
}));

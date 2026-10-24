/* Bundled into a Blob worker so web pages and standalone aggregates share
   the same local mesh code. The worker receives snapshots, never the live Sim. */
const Mesh = require('./mesh.js');
self.onmessage = function(event) {
  const message=event.data;
  try {
    const mesh=Mesh.build(message.snapshot);
    self.postMessage({id:message.id,epoch:message.epoch,version:message.version,mesh:mesh},
      mesh.positions?[mesh.positions.buffer,mesh.colors.buffer]:[]);
  } catch(error) { self.postMessage({id:message.id,epoch:message.epoch,error:String(error.message||error)}); }
};

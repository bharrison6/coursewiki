(function (root) {
  'use strict';
  const parts = Object.freeze([
    { id: 'left-step', name: 'Tall strip on the left', heights: [3, 1, 1], depth: 2 },
    { id: 'right-step', name: 'Tall strip on the right', heights: [1, 1, 3], depth: 2 },
    { id: 'ridge', name: 'Raised middle strip', heights: [1, 3, 1], depth: 2 }
  ].map(p => Object.freeze({ ...p, heights: Object.freeze(p.heights) })));

  function project(part, view) {
    const h = part.heights, width = h.length, height = Math.max(...h), depth = part.depth;
    if (view === 'front') {
      const outline = [[0, 0], [width, 0], [width, h[width - 1]]];
      for (let x = width - 1; x >= 0; x--) {
        outline.push([x, h[x]]);
        if (x > 0 && h[x - 1] !== h[x]) outline.push([x, h[x - 1]]);
      }
      return { width, height, outline, edges: [] };
    }
    if (view === 'top') {
      const edges = [];
      for (let x = 1; x < width; x++) {
        if (h[x] !== h[x - 1]) edges.push({ a: [x, 0], b: [x, depth], hidden: false });
      }
      return { width, height: depth, outline: [[0, 0], [width, 0], [width, depth], [0, depth]], edges };
    }
    if (view === 'right') {
      // Looking toward decreasing x: nearer material hides edges below its height.
      // Equal projected edges merge; any visible contributor wins over a hidden one.
      const levels = new Map();
      for (let x = 1; x < width; x++) {
        if (h[x] === h[x - 1]) continue;
        const z = Math.min(h[x], h[x - 1]);
        const hidden = h.slice(x).some(value => value > z);
        levels.set(z, levels.has(z) ? levels.get(z) && hidden : hidden);
      }
      return { width: depth, height,
        outline: [[0, 0], [depth, 0], [depth, height], [0, height]],
        edges: [...levels].sort((a, b) => a[0] - b[0]).map(([z, hidden]) => ({ a: [0, z], b: [depth, z], hidden })) };
    }
    throw new Error('Unknown view: ' + view);
  }

  function layout(convention) {
    if (convention === 'third') return { front: [100, 325], top: [100, 160], right: [330, 325] };
    if (convention === 'first') return { front: [310, 175], top: [310, 350], right: [100, 175] };
    throw new Error('Unknown projection convention: ' + convention);
  }

  function explain(part, view) {
    const shape = project(part, view);
    const names = { front: 'width and height', top: 'width and depth', right: 'depth and height' };
    const visible = shape.edges.filter(e => !e.hidden).length, hidden = shape.edges.filter(e => e.hidden).length;
    return `${view[0].toUpperCase() + view.slice(1)} view shows ${names[view]}. ` +
      (view === 'front' ? 'The outline follows the step heights.' :
        `The outline is rectangular, with ${visible} visible and ${hidden} hidden internal step edge${visible + hidden === 1 ? '' : 's'}.`);
  }
  const api = Object.freeze({ parts, project, layout, explain });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiViewProjection = api;
})(typeof globalThis === 'object' ? globalThis : this);

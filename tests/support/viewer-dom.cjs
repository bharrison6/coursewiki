'use strict';
// Small DOM adapter for the diagram viewer's non-layout lifecycle tests.
// Parse real built markup; layout and native dialog events are supplied by the harness.
class Element {
  constructor(tag, attrs = {}) { this.tagName = tag.toLowerCase(); this.attrs = attrs; this.children = []; this.listeners = {}; this.style = {}; this.open = false; }
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = v; }
  get classList() { return { contains: c => this.className.split(/\s+/).includes(c), toggle: (c, on) => { const a = new Set(this.className.split(/\s+/).filter(Boolean)); on ? a.add(c) : a.delete(c); this.className = [...a].join(' '); }, add: c => this.classList.toggle(c, true), remove: c => this.classList.toggle(c, false) }; }
  get src() { return this.attrs.src || ''; } set src(v) { this.attrs.src = v; }
  get alt() { return this.attrs.alt || ''; } set alt(v) { this.attrs.alt = v; }
  get currentSrc() { return this.src; }
  get naturalWidth() { return Number(this.attrs['data-natural-width']) || 960; }
  get naturalHeight() { return Number(this.attrs['data-natural-height']) || 480; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  setAttribute(k,v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(el) { el.remove(); this.children.push(el); el.parent = this; return el; }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; } }
  insertAdjacentElement(_, el) { this.parent.appendChild(el); }
  matches(selector) { return selector.split(',').some(part => {
    const s = part.trim(); const tag = s.match(/^[\w-]+/);
    if (tag && tag[0] !== this.tagName) return false;
    for (const m of s.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(m[1])) return false;
    for (const m of s.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) if (!(m[1] in this.attrs) || (m[2] !== undefined && this.attrs[m[1]] !== m[2])) return false;
    return true;
  }); }
  closest(s) { for (let e = this; e; e = e.parent) if (e.matches(s)) return e; return null; }
  querySelectorAll(s) {
    const result = [], parts = s.split(/\s+/);
    const visit = el => { for (const c of el.children) {
      if (c.matches(parts.at(-1)) && (parts.length === 1 || c.parent?.closest(parts.slice(0,-1).join(' ')))) result.push(c);
      visit(c);
    } }; visit(this); return result;
  }
  querySelector(s) { return this.querySelectorAll(s)[0] || null; }
  set innerHTML(html) { this.children = []; parse(html, this); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type, event = {}) { for (const fn of this.listeners[type] || []) fn(event); }
  getBoundingClientRect() { return { width: 100 }; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch('close'); }
  focus() {} scrollTo() {}
}
function parse(html, root = new Element('document')) {
  const stack = [root];
  html = html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  for (const m of html.matchAll(/<(\/?)([\w-]+)\b([^>]*)>/g)) {
    const tag = m[2].toLowerCase();
    if (m[1]) { for (let i=stack.length-1;i>0;i--) if(stack[i].tagName === tag) { stack.length=i; break; } continue; }
    const attrs = {};
    for (const a of m[3].matchAll(/([^\s=/'"]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1]] = a[2] ?? a[3] ?? a[4] ?? '';
    const el = stack.at(-1).appendChild(new Element(tag, attrs));
    if (!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag)) stack.push(el);
  }
  return root;
}
module.exports = { Element, parse };

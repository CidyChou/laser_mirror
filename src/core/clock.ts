export function nowMs(): number { const p=(globalThis as any).performance; return typeof p?.now==='function'?p.now():Date.now(); }

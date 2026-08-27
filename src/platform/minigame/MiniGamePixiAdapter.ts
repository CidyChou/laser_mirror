import {
  AccessibilitySystem,
  AbstractRenderer,
  DOMAdapter,
  DOMPipe,
  EventSystem,
  GlContextSystem,
  extensions,
} from 'pixi.js';

export interface MiniGameApi {
  createCanvas?: () => any;
  createOffscreenCanvas?: (options?: any) => any;
  createImage?: () => any;
  getSystemInfoSync?: () => any;
  getFileSystemManager?: () => any;
}

/**
 * Pixi uses `instanceof DOMAdapter.getWebGLRenderingContext()` in several
 * independent systems. Mini-game runtimes do not reliably expose the native
 * WebGLRenderingContext constructor, so returning a placeholder class makes a
 * WebGL1 context look like WebGL2 to Pixi's texture system.
 *
 * Use capability based `instanceof` semantics instead. This keeps context,
 * texture-format and blend-mode detection in agreement.
 */
class MiniGameWebGL1Context {
  static [Symbol.hasInstance](value: any) {
    return isWebGLContext(value) && !isWebGL2Context(value);
  }
}

export function installMiniGamePixiAdapter(api: MiniGameApi) {
  if (!api) throw new Error('Mini-game API is unavailable');
  const global = globalThis as any;
  installMiniGameDomFacade(global);

  const adapter: any = {
    createCanvas: (width = 1, height = 1) => {
      const canvas = api.createOffscreenCanvas?.({ type: '2d', width, height })
        ?? api.createOffscreenCanvas?.({ width, height })
        ?? (typeof global.OffscreenCanvas === 'function' ? new global.OffscreenCanvas(width, height) : null)
        ?? api.createCanvas?.();
      if (!canvas) throw new Error('Platform canvas API is unavailable');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    },
    createImage: () => api.createImage?.() ?? {},
    getCanvasRenderingContext2D: () => global.CanvasRenderingContext2D ?? class CanvasRenderingContext2D {},
    getWebGLRenderingContext: () => MiniGameWebGL1Context,
    getFontFaceSet: () => undefined,
    getNavigator: () => (global.navigator ?? { userAgent: 'MiniGame', gpu: null }),
    getBaseUrl: () => '',
    fetch: (url: any, options: any) => {
      if (typeof global.fetch === 'function') return global.fetch(url, options);
      return Promise.reject(new Error('No fetch adapter configured. Bundle local assets or implement platform request -> Response.'));
    },
    parseXML: () => { throw new Error('XML parsing is not enabled in the game runtime.'); },
  };
  DOMAdapter.set(adapter);
  // Browser-only renderer extensions construct real DOM nodes during renderer
  // initialization. Mini games have no DOM and this project does not use them.
  extensions.remove(AccessibilitySystem,DOMPipe);
  patchRendererDiagnosticsForMiniGame();
  patchEventSystemForMiniGame();
  patchGlContextForMiniGame();
}

function patchRendererDiagnosticsForMiniGame(){
  const proto=AbstractRenderer.prototype as any;
  if(proto.__laserMirrorDiagnosticsPatched)return;
  proto.__laserMirrorDiagnosticsPatched=true;

  const originalAddSystem=proto._addSystem;
  proto._addSystem=function addTaggedSystem(ClassRef:any,name:string){
    // These extensions can be queued before WebGLRenderer installs its
    // extension handlers, so extensions.remove() alone is order-dependent.
    if(name==='accessibility')return this;
    let result:any;
    try{result=originalAddSystem.call(this,ClassRef,name);}catch(error){throw stageError(`Pixi system "${name}" constructor failed`,error);}
    const system=this._systemsHash?.[name];
    if(system&&typeof system.init==='function'&&!system.__laserMirrorInitTagged){
      const originalInit=system.init;
      system.__laserMirrorInitTagged=true;
      system.init=async function taggedSystemInit(...args:any[]){
        try{return await originalInit.apply(this,args);}catch(error){throw stageError(`Pixi system "${name}" init failed`,error);}
      };
    }
    return result;
  };

  const originalAddPipes=proto._addPipes;
  proto._addPipes=function addTaggedPipes(...args:any[]){
    const pipes=Array.isArray(args[0])?args[0].filter((pipe:any)=>pipe?.name!=='dom'):args[0];
    try{return originalAddPipes.call(this,pipes,args[1]);}catch(error){throw stageError('Pixi render pipes construction failed',error);}
  };

  const originalInit=proto.init;
  proto.init=async function taggedRendererInit(...args:any[]){
    try{return await originalInit.apply(this,args);}catch(error){
      if((error as any)?.__laserMirrorStage)throw error;
      throw stageError('Pixi renderer bootstrap failed',error);
    }
  };
}

function stageError(stage:string,error:any){
  const wrapped:any=new Error(`${stage}: ${describeError(error)}`);
  wrapped.__laserMirrorStage=true;
  const causeStack=String(error?.stack??'');
  if(causeStack)wrapped.stack=`${wrapped.name}: ${wrapped.message}\nCaused by:\n${causeStack}`;
  return wrapped;
}

function describeError(error:any){
  const parts:string[]=[];
  try{parts.push(`value=${String(error)}`);}catch{}
  for(const key of ['name','message','errMsg','code']){
    try{if(error?.[key]!==undefined)parts.push(`${key}=${String(error[key])}`);}catch{}
  }
  try{
    const data=Object.keys(error??{}).reduce((out:any,key)=>{out[key]=String(error[key]);return out;},{});
    if(Object.keys(data).length)parts.push(`fields=${JSON.stringify(data)}`);
  }catch{}
  return parts.join(' | ')||'unknown error';
}

function installMiniGameDomFacade(global: any) {
  // Pixi's EventSystem installs DOM listeners during Application.init().
  // Real mini-game runtimes have no DOM (the desktop simulator does), so keep
  // those hooks harmless until BaseMiniGamePlatform installs native touches.
  global.document ??= {};
  if(typeof global.document.addEventListener!=='function')global.document.addEventListener=()=>{};
  if(typeof global.document.removeEventListener!=='function')global.document.removeEventListener=()=>{};
  if(typeof global.addEventListener!=='function')global.addEventListener=()=>{};
  if(typeof global.removeEventListener!=='function')global.removeEventListener=()=>{};
  global.navigator ??= { userAgent: 'MiniGame', gpu: null };

  // Pixi's GC system reads the browser Performance API during renderer init.
  // Some real-device mini-game runtimes expose Date/RAF but no `performance`
  // global at all. Keep the fallback monotonic so ticker/GC age calculations
  // cannot move backwards when the wall clock changes.
  if (!global.performance || typeof global.performance.now !== 'function') {
    const startedAt = Date.now();
    let lastNow = 0;
    global.performance = {
      ...(global.performance ?? {}),
      timeOrigin: startedAt,
      now: () => {
        lastNow = Math.max(lastNow, Date.now() - startedAt);
        return lastNow;
      },
    };
  }
}

function patchEventSystemForMiniGame() {
  const proto=EventSystem.prototype as any;
  if(proto.__laserMirrorMiniGamePatched)return;
  proto.__laserMirrorMiniGamePatched=true;

  // There is no DOM event target on a real mini-game device. Native touches
  // are installed by BaseMiniGamePlatform.attachCanvas after renderer init.
  proto._addEvents=function addMiniGameEvents(){this._eventsAdded=false;};
  proto._removeEvents=function removeMiniGameEvents(){this._eventsAdded=false;};
}

function isWebGLContext(gl: any): boolean {
  return !!gl
    && typeof gl.getParameter === 'function'
    && typeof gl.createShader === 'function'
    && typeof gl.texImage2D === 'function';
}

function isWebGL2Context(gl: any): boolean {
  if (!gl) return false;

  // Mini-game wrappers frequently hide the native WebGL2RenderingContext
  // constructor and may omit individual UBO methods. GL_VERSION is supplied
  // by the driver and is the authoritative discriminator in that case.
  try {
    const version = String(gl.getParameter?.(gl.VERSION) ?? '');
    if (/WebGL\s*2(?:\.0)?/i.test(version)) return true;
    if (/WebGL\s*1(?:\.0)?/i.test(version)) return false;
  } catch {}

  const global = globalThis as any;
  if (typeof global.WebGL2RenderingContext === 'function') {
    try {
      if (gl instanceof global.WebGL2RenderingContext) {
        return typeof gl.createVertexArray === 'function';
      }
    } catch {}
  }
  const name = String(gl.constructor?.name || '');
  if (/WebGL2/i.test(name) && typeof gl.createVertexArray === 'function') return true;
  return typeof gl.createVertexArray === 'function'
    && typeof gl.bindVertexArray === 'function'
    && typeof gl.texImage3D === 'function';
}

function patchGlContextForMiniGame() {
  const proto = GlContextSystem.prototype as any;
  if (proto.__laserMirrorPatched) return;
  proto.__laserMirrorPatched = true;

  proto.initFromContext = function initFromContext(gl: any) {
    this.gl = gl;
    this.webGLVersion = isWebGL2Context(gl) ? 2 : 1;
    this.getExtensions();
    if (!this.extensions.vertexArrayObject && this.webGLVersion === 1) {
      this.extensions.vertexArrayObject = createVaoPolyfill(
        gl,
        this.extensions.vertexAttribDivisorANGLE,
      );
    }
    this.validateContext(gl);
    this._renderer.runners.contextChange.emit(gl);
    const element = this._renderer.view.canvas;
    if (element?.addEventListener) {
      element.addEventListener('webglcontextlost', this.handleContextLost, false);
      element.addEventListener('webglcontextrestored', this.handleContextRestored, false);
    }
  };
}

function createVaoPolyfill(gl: any, instancedArrays: any) {
  type Attrib = {
    enabled: boolean;
    buffer: any;
    size: number;
    type: number;
    normalized: boolean;
    stride: number;
    offset: number;
    divisor: number;
  };
  type Vao = { attribs: Record<number, Attrib>; elementBuffer: any };

  const origBindBuffer = gl.bindBuffer.bind(gl);
  const origEnable = gl.enableVertexAttribArray.bind(gl);
  const origDisable = gl.disableVertexAttribArray.bind(gl);
  const origPointer = gl.vertexAttribPointer.bind(gl);
  const nativeDivisor = typeof instancedArrays?.vertexAttribDivisorANGLE === 'function'
    ? instancedArrays.vertexAttribDivisorANGLE.bind(instancedArrays)
    : typeof gl.vertexAttribDivisor === 'function'
      ? gl.vertexAttribDivisor.bind(gl)
      : null;
  const ARRAY_BUFFER = gl.ARRAY_BUFFER;
  const ELEMENT_ARRAY_BUFFER = gl.ELEMENT_ARRAY_BUFFER;
  const maxAttribs = Number(gl.getParameter(gl.MAX_VERTEX_ATTRIBS)) || 8;
  let current: Vao | null = null;
  let arrayBuffer: any = null;

  gl.bindBuffer = (target: number, buffer: any) => {
    origBindBuffer(target, buffer);
    if (target === ARRAY_BUFFER) arrayBuffer = buffer;
    if (target === ELEMENT_ARRAY_BUFFER && current) current.elementBuffer = buffer;
  };
  gl.enableVertexAttribArray = (index: number) => {
    origEnable(index);
    if (!current) return;
    const attrib = current.attribs[index] ?? emptyAttrib();
    attrib.enabled = true;
    current.attribs[index] = attrib;
  };
  gl.disableVertexAttribArray = (index: number) => {
    origDisable(index);
    if (current?.attribs[index]) current.attribs[index].enabled = false;
  };
  gl.vertexAttribPointer = (index: number, size: number, type: number, normalized: boolean, stride: number, offset: number) => {
    origPointer(index, size, type, normalized, stride, offset);
    if (!current) return;
    current.attribs[index] = {
      ...(current.attribs[index] ?? emptyAttrib()),
      buffer: arrayBuffer,
      size,
      type,
      normalized,
      stride,
      offset,
    };
  };
  const recordDivisor = (index: number, divisor: number) => {
    nativeDivisor?.(index, divisor);
    if (!current) return;
    const attrib = current.attribs[index] ?? emptyAttrib();
    attrib.divisor = divisor;
    current.attribs[index] = attrib;
  };
  if (instancedArrays && nativeDivisor) {
    // GlGeometrySystem installs gl.vertexAttribDivisor *after* the context
    // runner starts, forwarding to this extension method. Wrap the extension
    // itself so divisor state is captured regardless of that initialization
    // order.
    instancedArrays.vertexAttribDivisorANGLE = recordDivisor;
  } else if (nativeDivisor) {
    gl.vertexAttribDivisor = (index: number, divisor: number) => {
      recordDivisor(index, divisor);
    };
  }

  return {
    createVertexArrayOES(): Vao {
      return { attribs: {}, elementBuffer: null };
    },
    bindVertexArrayOES(vao: Vao | null) {
      current = vao;
      if (!vao) {
        origBindBuffer(ELEMENT_ARRAY_BUFFER, null);
        for (let i = 0; i < maxAttribs; i++) {
          origDisable(i);
          nativeDivisor?.(i, 0);
        }
        return;
      }
      origBindBuffer(ELEMENT_ARRAY_BUFFER, vao.elementBuffer);
      for (let i = 0; i < maxAttribs; i++) {
        const attrib = vao.attribs[i];
        if (!attrib?.enabled) {
          origDisable(i);
          nativeDivisor?.(i, 0);
          continue;
        }
        origBindBuffer(ARRAY_BUFFER, attrib.buffer);
        arrayBuffer = attrib.buffer;
        origPointer(i, attrib.size, attrib.type, attrib.normalized, attrib.stride, attrib.offset);
        origEnable(i);
        nativeDivisor?.(i, attrib.divisor || 0);
      }
    },
    deleteVertexArrayOES() {},
  };
}

function emptyAttrib() {
  return {
    enabled: false,
    buffer: null,
    size: 0,
    type: 0,
    normalized: false,
    stride: 0,
    offset: 0,
    divisor: 0,
  };
}

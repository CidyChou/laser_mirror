import type { AlbumSaveResult } from './IPlatform';

const AUTH_SCOPE = 'scope.writePhotosAlbum';

export async function downloadCanvas(canvas: unknown, filename: string): Promise<AlbumSaveResult> {
  const node = canvas as {
    toBlob?: (callback: (blob: Blob | null) => void, type?: string, quality?: number) => void;
    toDataURL?: (type?: string, quality?: number) => string;
    convertToBlob?: (options?: { type?: string; quality?: number }) => Promise<Blob>;
  };
  try {
    const blob = await canvasToBlob(node);
    if (blob) {
      try {
        if (typeof File === 'function') {
          const file = new File([blob], filename, { type: 'image/png' });
          if (await shareFile(file)) return { ok: true, message: '已保存到相册' };
        }
      } catch {}
      if (triggerDownload(URL.createObjectURL(blob), filename, true)) {
        return { ok: true, message: '已保存图片' };
      }
    }
    const dataUrl = node.toDataURL?.('image/png');
    if (dataUrl && triggerDownload(dataUrl, filename, false)) {
      return { ok: true, message: '已保存图片' };
    }
    return { ok: false, message: '保存失败' };
  } catch {
    return { ok: false, message: '保存失败' };
  }
}

export async function saveCanvasToAlbum(api: any, canvas: unknown): Promise<AlbumSaveResult> {
  if (!api) return { ok: false, message: '当前平台暂不支持保存' };
  try {
    const filePath = await exportCanvasFile(api, canvas);
    await ensureAlbumAuth(api);
    await promisify(api.saveImageToPhotosAlbum, api, { filePath });
    return { ok: true, message: '已保存到相册' };
  } catch (error) {
    if (isAuthError(error)) {
      try { api.openSetting?.({}); } catch {}
      return { ok: false, message: '需要相册权限' };
    }
    return { ok: false, message: albumMessage(error) };
  }
}

async function canvasToBlob(canvas: {
  toBlob?: (callback: (blob: Blob | null) => void, type?: string, quality?: number) => void;
  convertToBlob?: (options?: { type?: string; quality?: number }) => Promise<Blob>;
  toDataURL?: (type?: string, quality?: number) => string;
}): Promise<Blob | null> {
  if (typeof canvas.toBlob === 'function') {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob!(resolve, 'image/png'));
    if (blob) return blob;
  }
  if (typeof canvas.convertToBlob === 'function') {
    try { return await canvas.convertToBlob({ type: 'image/png' }); } catch {}
  }
  const dataUrl = canvas.toDataURL?.('image/png');
  if (!dataUrl) return null;
  const comma = dataUrl.indexOf(',');
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

async function shareFile(file: File): Promise<boolean> {
  if (typeof navigator === 'undefined' || !/iP(hone|ad|od)/.test(navigator.userAgent || '')) return false;
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean; share?: (data: { files: File[]; title?: string }) => Promise<void> };
  if (typeof nav.canShare !== 'function' || typeof nav.share !== 'function') return false;
  try {
    if (!nav.canShare({ files: [file] })) return false;
    await nav.share({ files: [file], title: file.name });
    return true;
  } catch (error) {
    if ((error as { name?: string } | null)?.name === 'AbortError') return false;
    return false;
  }
}

function triggerDownload(href: string, filename: string, revoke: boolean): boolean {
  if (typeof document === 'undefined') return false;
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body?.appendChild(anchor);
  anchor.click();
  anchor.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(href), 2500);
  return true;
}

async function exportCanvasFile(api: any, canvas: unknown): Promise<string> {
  const node = canvas as {
    toDataURL?: (type?: string) => string;
    toTempFilePath?: (options: Record<string, unknown>) => void;
  };
  const base64 = stripDataUrl(node.toDataURL?.('image/png'));
  if (base64) return writeBase64File(api, base64);
  if (typeof api.canvasToTempFilePath === 'function') {
    const result = await promisify<{ tempFilePath?: string }>(api.canvasToTempFilePath, api, {
      canvas,
      fileType: 'png',
      quality: 1,
    });
    if (result?.tempFilePath) return result.tempFilePath;
  }
  if (typeof node.toTempFilePath === 'function') {
    const result = await new Promise<{ tempFilePath?: string }>((resolve, reject) => {
      node.toTempFilePath!({
        fileType: 'png',
        success: resolve,
        fail: reject,
      });
    });
    if (result?.tempFilePath) return result.tempFilePath;
  }
  throw new Error('无法导出图片');
}

function writeBase64File(api: any, data: string): Promise<string> {
  const fs = api.getFileSystemManager?.();
  const root = api.env?.USER_DATA_PATH;
  if (!fs || !root) return Promise.reject(new Error('无法写入临时文件'));
  const filePath = `${root}/laser-mirror-poster.png`;
  return promisify(fs.writeFile, fs, { filePath, data, encoding: 'base64' }).then(() => filePath);
}

function stripDataUrl(value?: string): string | null {
  if (!value || value.indexOf('base64,') < 0) return null;
  return value.slice(value.indexOf('base64,') + 7);
}

async function ensureAlbumAuth(api: any): Promise<void> {
  const setting = await peekSetting(api);
  if (setting === true) return;
  if (setting === false) throw Object.assign(new Error('auth'), { code: 'auth' });
  if (typeof api.authorize !== 'function') return;
  try {
    await promisify(api.authorize, api, { scope: AUTH_SCOPE });
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error('auth'), { code: 'auth' });
  }
}

function peekSetting(api: any): Promise<boolean | undefined> {
  if (typeof api.getSetting !== 'function') return Promise.resolve(undefined);
  return promisify<{ authSetting?: Record<string, boolean> }>(api.getSetting, api, {})
    .then((res) => res?.authSetting?.[AUTH_SCOPE])
    .catch(() => undefined);
}

function promisify<T>(fn: ((options: any) => void) | undefined, owner: any, options: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof fn !== 'function') {
      reject(new Error('接口不可用'));
      return;
    }
    fn.call(owner, {
      ...options,
      success: (res: T) => resolve(res),
      fail: (error: unknown) => reject(error),
    });
  });
}

function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: string; errMsg?: string; errno?: number };
  if (value.code === 'auth') return true;
  const message = String(value.errMsg ?? '');
  return /auth deny|authorize|permission|scope\.writePhotosAlbum/i.test(message);
}

function albumMessage(error: unknown): string {
  const message = String((error as { errMsg?: string; message?: string } | null)?.errMsg
    ?? (error as { message?: string } | null)?.message
    ?? '');
  if (/cancel/i.test(message)) return '已取消';
  return message && message.length < 28 ? message : '保存失败';
}

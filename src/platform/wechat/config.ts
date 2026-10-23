import settings from '../../../templates/wechat/operations.json';

export type WeChatOperationsConfig = typeof settings;
export const WECHAT_OPERATIONS: WeChatOperationsConfig = settings;

// This is WeChat's shared recommendation component, not another game's circle.
export const RECOMMENDATION_OPENLINK = 'TWFRCqV5WeM2AkMXhKwJ03MhfPOieJfAsvXKUbWvQFQtLyyA5etMPabBehga950uzfZcH3Vi3QeEh41xRGEVFw';

export function reportOperation(api: any, name: string, data: Record<string, string | number | boolean>) {
  try {
    const result = api.reportEvent?.(name, data);
    if (result && typeof result.catch === 'function') void result.catch(() => {});
  } catch { /* Optional analytics cannot affect rewards or gameplay. */ }
}

/** 只把可识别的失败类型转换为固定中文提示，不回显地址、凭据或服务端原始日志。 */
export function sliderFailureMessage(error: unknown): string {
  const diagnostics: string[] = [];
  let current = error;
  for (let depth = 0; depth < 3 && current && typeof current === "object"; depth += 1) {
    const record = current as { message?: unknown; errMsg?: unknown; cause?: unknown };
    if (typeof record.message === "string") diagnostics.push(record.message);
    if (typeof record.errMsg === "string") diagnostics.push(record.errMsg);
    current = record.cause;
  }
  const text = diagnostics.join(" ");
  if (/未配置.*(?:API|接口)|VITE_API_BASE_URL/i.test(text)) {
    return "未配置小程序接口地址，请联系维护人员配置 VITE_API_BASE_URL 后重新编译。";
  }
  if (/not in.*domain|domain.*list|合法域名|域名.*校验/i.test(text)) {
    return "请求域名未通过微信校验，请联系维护人员配置 request 合法域名并检查 HTTPS。";
  }
  if (/timeout|timed?\s*out|超时/i.test(text)) {
    return "安全验证请求超时，请检查网络后重试。";
  }
  if (/\bssl\b|\btls\b|hand\s*shake|certificate|cert_|证书|(?:must|only|仅支持).*https/i.test(text)) {
    return "安全验证服务的 HTTPS 连接失败，请联系维护人员检查证书和 TLS 配置。";
  }
  if (/network|request:fail|connect|offline|econn|enotfound|dns|网络/i.test(text)) {
    return "无法连接安全验证服务，请检查网络；若持续失败，请联系维护人员检查接口地址和服务状态。";
  }
  if (/过期|expired/i.test(text)) return "安全验证已过期，请点击重试后重新拖动。";
  if (/未通过/i.test(text)) return "滑动验证未通过，请点击重试后平稳拖动滑块。";
  return "安全验证服务暂不可用，请点击重试；若持续失败，请联系维护人员检查服务。";
}

/** 只在当前组件内测量实际轨道，异常或未回调时交由调用方保留安全默认值。 */
export function measureSliderTrack(
  component: unknown,
  createQuery: () => UniNamespace.SelectorQuery = () => uni.createSelectorQuery(),
): Promise<number | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (width: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(width);
    };
    const timeout = setTimeout(() => finish(null), 500);
    try {
      if (!component) { finish(null); return; }
      createQuery().in(component).select(".auth-slider__track").boundingClientRect((rect) => {
        const width = !Array.isArray(rect) && rect ? rect.width : undefined;
        finish(typeof width === "number" && Number.isFinite(width) && width > 48 ? width : null);
      }).exec();
    } catch { finish(null); }
  });
}

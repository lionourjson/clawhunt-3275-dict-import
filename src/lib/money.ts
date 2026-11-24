/** 金额一律以分存整数（数据库/接口层）；仅在展示层转换为元字符串。 */
export function fenToYuan(fen: number): string {
  if (!Number.isInteger(fen)) {
    throw new TypeError(`金额必须以分存整数，收到：${fen}`);
  }
  return (fen / 100).toFixed(2);
}

/** 元输入转分（表单层），非法输入返回 NaN。 */
export function yuanToFen(yuan: string): number {
  const n = Number(yuan);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

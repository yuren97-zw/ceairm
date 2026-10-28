// Inclusive calendar dates, independent of the host timezone.
export function handoverDays(value = 1) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 3) throw new Error('交接重叠天数必须为1～3天');
  return days;
}
export function handoverEnd(start, value = 1) {
  const days = handoverDays(value);
  const date = new Date(`${start}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== start) throw new Error('交接开始日期无效');
  date.setUTCDate(date.getUTCDate() + days - 1);
  return date.toISOString().slice(0,10);
}

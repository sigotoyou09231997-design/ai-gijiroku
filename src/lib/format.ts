import { format } from "date-fns";
import { ja } from "date-fns/locale";

export function formatDateTime(at: number): string {
  return format(at, "yyyy年M月d日(E) HH:mm", { locale: ja });
}

export function formatTime(at: number): string {
  return format(at, "HH:mm:ss");
}

/** 経過時間を「12分34秒」の形にする。 */
export function formatDuration(fromMs: number, toMs: number): string {
  const total = Math.max(0, Math.floor((toMs - fromMs) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds}秒`;
  return `${minutes}分${seconds}秒`;
}

import { zh } from "./translations";
export type Locale = "en" | "zh";
export function translate(text: string, locale: Locale): string {
  if (locale === "en") return text;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (zh[normalized]) return zh[normalized];
  const patterns: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/^Demo (.+) team$/, (m) => `模拟${translate(m[1], locale)}团队`],
    [/^Notification group for (.+)$/, (m) => `${m[1]}的通知分组`],
    [
      /^Cancel (.+)’s appointment and release the slot\?$/,
      (m) => `取消 ${m[1]} 的预约并释放号源？`,
    ],
    [/^(\d+) eligible matches$/, (m) => `${m[1]} 位合格候选人`],
    [/^(\d+) days earlier$/, (m) => `提前 ${m[1]} 天`],
    [
      /^(.+) accepted \(demo\)$/,
      (m) => `接受 ${translate(m[1], locale)}（模拟保险）`,
    ],
    [/^(.+) accepted$/, (m) => `接受 ${translate(m[1], locale)}`],
    [/^(.+) staff$/, (m) => `${m[1]} 前台`],
    [
      /^(.+) approved a (.+) opening\. Accept within (\d+) minutes to confirm\.$/,
      (m) =>
        `${m[1]} 已批准${translate(m[2], locale)}空位，请在 ${m[3]} 分钟内接受。`,
    ],
    [
      /^Your (.+) appointment at (.+) is confirmed\. Any linked original booking has been rescheduled\.$/,
      (m) =>
        `你在 ${m[2]} 的${translate(m[1], locale)}预约已确认，关联的原预约已改期。`,
    ],
    [
      /^Approved an eligible match: (.+)$/,
      (m) => `已批准匹配：${translate(m[1], locale)}`,
    ],
    [
      /^(\d+) eligible candidates?\. Review in waitlist order\. (.+) is first: (.+)\. Staff must confirm scheduling suitability; this is not clinical triage\.$/,
      (m) =>
        `${m[1]} 位患者符合条件，按候补时间排序。首位为 ${m[2]}：${m[3]
          .split("; ")
          .map((s) => translate(s, locale))
          .join("；")}。前台仍需审核，这不是临床分诊。`,
    ],
  ];
  for (const [pattern, render] of patterns) {
    const match = normalized.match(pattern);
    if (match) return render(match);
  }
  return text; // Proper names, addresses and staff-entered notes stay as entered.
}

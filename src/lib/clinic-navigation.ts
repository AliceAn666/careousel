export type WaitlistTab = "matches" | "priorities" | "notifications";
export function clinicSection(path: string) {
  if (["/clinic/waitlists", "/clinic/priorities"].includes(path))
    return "waitlists";
  if (
    [
      "/clinic/records",
      "/clinic/medical-records",
      "/clinic/medical-tags",
    ].includes(path)
  )
    return "records";
  return path === "/clinic/schedule" ? "schedule" : undefined;
}
export function waitlistTab(path: string, tab: string | null): WaitlistTab {
  if (path === "/clinic/priorities" || tab === "priorities")
    return "priorities";
  return tab === "notifications" ? "notifications" : "matches";
}
// Only navigation identifiers enter URLs; never medical notes or record excerpts.
export function waitlistHref(
  tab: WaitlistTab,
  slotId?: string,
  requestId?: string,
) {
  const params = new URLSearchParams();
  if (slotId) params.set("slotId", slotId);
  if (requestId) params.set("requestId", requestId);
  params.set("tab", tab);
  return `/clinic/waitlists?${params}`;
}

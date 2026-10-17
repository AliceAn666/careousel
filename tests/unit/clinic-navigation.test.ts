import { expect, it } from "vitest";
import {
  clinicSection,
  waitlistHref,
  waitlistTab,
} from "../../src/lib/clinic-navigation";
it("maps legacy child bookmarks to the correct workspace and section", () => {
  expect(clinicSection("/clinic/access")).toBeUndefined();
  expect(clinicSection("/clinic/activity")).toBeUndefined();
  expect(clinicSection("/clinic/schedule")).toBe("schedule");
  expect(clinicSection("/clinic/priorities")).toBe("waitlists");
  expect(waitlistTab("/clinic/priorities", null)).toBe("priorities");
  expect(waitlistTab("/clinic/waitlists", "notifications")).toBe(
    "notifications",
  );
  expect(waitlistTab("/clinic/waitlists", "unknown")).toBe("matches");
  expect(clinicSection("/clinic/medical-records")).toBe("records");
  expect(clinicSection("/clinic/medical-tags")).toBe("records");
});
it("round-trips opaque opening and request identifiers safely between sections", () => {
  for (const tab of ["matches", "priorities", "notifications"] as const) {
    const url = new URL(
      waitlistHref(tab, "slot a&b", "request#1"),
      "https://example.test",
    );
    expect(url.searchParams.get("slotId")).toBe("slot a&b");
    expect(url.searchParams.get("requestId")).toBe("request#1");
    expect(url.searchParams.get("tab")).toBe(tab);
  }
});

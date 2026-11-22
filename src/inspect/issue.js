// A new issue for a report (SPEC §12.5). The report itself is too long for an
// address; the form asks to paste it.
export const ISSUES = "https://github.com/henzeb/gaffer/issues/new";
// The issue form for Inspect reports (.github/ISSUE_TEMPLATE/inspect.yml). A
// query parameter with the id of a field fills that field in.
export const TEMPLATE = "inspect.yml";

// report: only for a report saved as a file, the request to attach it.
export function issueUrl(site, report) {
  const s = site || "?";
  return ISSUES + "?template=" + TEMPLATE + "&title=" + encodeURIComponent("Inspect: " + s) + "&site=" + encodeURIComponent(s) + (report ? "&report=" + encodeURIComponent(report) : "");
}

// The site of a page, without www.
export function siteOf(host) {
  return String(host || "").toLowerCase().replace(/^www\./, "");
}

// The Chrome version from the user agent.
export function chromeVersion(ua) {
  const m = /Chrome\/([\d.]+)/.exec(String(ua || ""));
  return m ? m[1] : "?";
}

// GitHub takes at most 65,536 characters in the body of an issue; this leaves
// room for the description (SPEC §12.5).
export const ISSUE_ROOM = 60000;

export function fitsIssue(report) {
  return String(report).length <= ISSUE_ROOM;
}

// gaffer-inspect-<site>-<yyyy-mm-dd>.txt, for a report that is too long.
export function reportFileName(site, date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return "gaffer-inspect-" + (site || "page").replace(/[^a-z0-9.-]/gi, "_") + "-" + date.getFullYear() + "-" + p(date.getMonth() + 1) + "-" + p(date.getDate()) + ".txt";
}

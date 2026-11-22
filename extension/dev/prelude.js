(function (rules, run) {
  var host = "";
  try {
    var origins = location.ancestorOrigins;
    host = window.top === window || !origins || !origins.length ? location.hostname : new URL(origins[origins.length - 1]).hostname;
  } catch (e) {
    return;
  }
  host = host.toLowerCase().replace(/^www\./, "");
  if (!host) return;
  var on = rules.d;
  var best = "";
  for (var s in rules.s) {
    if (Object.prototype.hasOwnProperty.call(rules.s, s) && s.length > best.length && (host === s || host.endsWith("." + s))) {
      best = s;
      on = rules.s[s];
    }
  }
  if (!on) return;
  window.__gafferAuto = true;
  run();
})(__RULES__, function () {
__MODULE__
});

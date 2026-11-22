// The guard around every part of Direct (SPEC §11.8): timers and event
// handlers alike, so an error nobody thought of is caught, shown once, kept per
// part for Inspect (SPEC §12.1) and told to its monitor (SPEC §12.2). One per
// core, because every video runs its own copy of these modules.
import { createSafe } from "../shared/errors.js";
import { t } from "../shared/i18n.js";
import { tell } from "./tell.js";

export const safe = createSafe(
  "[Gaffer Direct]",
  (name, error) => t("direct.error.in", { name, error }),
  (name, error) => tell(t("direct.tell.error", { name, error })),
);

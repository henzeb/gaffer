import { state as s } from "../../state.js";
import { jwPlayer } from "../../../shared/tracks/players.js";

export function jwplayerAdapter() {
  try {
    const jp = jwPlayer(s.v);
    if (!(jp && jp.getQualityLevels && (jp.getQualityLevels() || []).length > 1)) return null;
    return {
      list() {
        return (jp.getQualityLevels() || []).map((q, i) => ({ id: i, label: q.label || (q.height ? q.height + "p" : String(i)) }));
      },
      cur() {
        return jp.getCurrentQuality();
      },
      set(id) {
        jp.setCurrentQuality(id === "auto" ? 0 : id);
      },
    };
  } catch (e) {
    return null;
  }
}

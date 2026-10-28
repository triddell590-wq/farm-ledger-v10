// Overview (design/01 §7): the farm at a glance. Tabs: Today · Money · Map · People · More.
import { session } from "../services/session.js";
import { makeScreen, farmTabs } from "./common.js";

export default async function overview({ params }) {
  const tab = params.tab;
  const tabs = farmTabs();
  const farm = session.farm();
  const mod = await import(`./overview-${tab}.js`);
  const s = await mod.default(farm, params);
  return makeScreen({ body: s.el, title: s.title, area: "farm", tab, depth: 0, chrome: { tabs, tab, fab: s.fab || null, compactTitle: s.title }, destroy: s.destroy, mounted: s.mounted });
}

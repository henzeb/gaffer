import { launch } from "./harness.js";

const steps = JSON.parse(process.argv[2] || "[]");
const tool = process.env.BM || "direct";

(async () => {
  const page = await launch();
  try {
    await page.open(process.env.URL || process.env.PAGE || "video.html");
    await page.run(tool);
    await page.sleep(1000);
    console.log("run:", tool);
    for (const s of steps) {
      const [cmd, ...rest] = s.split(":");
      const arg = rest.join(":");
      const nums = arg.split(",").map(Number);
      if (cmd === "WHEEL") await page.wheel(nums[0], nums[1], nums[2], nums[3] || 0);
      else if (cmd === "DRAG") await page.drag(...nums.slice(0, 4));
      else if (cmd === "TAP") await page.clickAt(nums[0], nums[1], { count: nums[2] || 1 });
      else if (cmd === "CLICK") await page.clickButton(arg);
      else if (cmd === "CLICKSEL") await page.click(arg);
      else if (cmd === "MOVE") await page.move(nums[0], nums[1]);
      else if (cmd === "HOVER") await page.hover(arg);
      else if (cmd === "KEY") await page.key(arg);
      else if (cmd === "WAIT") await page.sleep(nums[0]);
      else { console.log(">", s, "=>", JSON.stringify(await page.eval(s))); continue; }
      console.log(">", s, "=>", JSON.stringify(await page.dyn()));
    }
    for (const l of page.logs) console.log("CONSOLE", l);
  } finally {
    await page.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });

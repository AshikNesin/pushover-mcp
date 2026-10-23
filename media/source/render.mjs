// Renders an HTML scene frame by frame and encodes it to MP4.
// The scene exposes window.render(t) and window.VIDEO = { width, height, duration }.
// Needs Playwright (with Chromium), ffmpeg, and the Inter and JetBrains Mono fonts.
//
//   node render.mjs demo.html ../demo.mp4                    # dark demo video
//   node render.mjs "demo.html?theme=light" ../demo-light.mp4
//   node render.mjs og.html out.mp4 --still 0                # OG image (still-og-0.png)
//   node render.mjs "og.html?theme=light" out.mp4 --still 0  # (still-og-light-0.png)
import { spawn } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { chromium } from "playwright";

const FPS = 30;
const [sceneArg = "scene.html", outPath = "out.mp4"] = process.argv.slice(2);
const [scenePath, query = ""] = sceneArg.split("?");
const scene = resolve(scenePath);
const url = `file://${scene}${query ? `?${query}` : ""}`;
const theme = new URLSearchParams(query).get("theme");

const browser = await chromium.launch();
const probe = await browser.newPage();
await probe.goto(url);
const { width, height, duration } = await probe.evaluate(
  () => window.VIDEO ?? { width: 1920, height: 1080, duration: 36 },
);
await probe.close();

const page = await browser.newPage({ viewport: { width, height } });
await page.goto(url);
await page.evaluate(() => document.fonts.ready);

const stillsFlag = process.argv.indexOf("--still");
if (stillsFlag !== -1) {
  const prefix = [basename(scene, ".html"), theme].filter(Boolean).join("-");
  for (const t of process.argv.slice(stillsFlag + 1).map(Number)) {
    await page.evaluate((time) => window.render(time), t);
    await page.screenshot({ path: join(dirname(scene), `still-${prefix}-${t}.png`) });
  }
} else {
  const ffmpeg = spawn(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
     "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
     "-movflags", "+faststart", resolve(outPath)],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const frames = Math.round(FPS * duration);
  for (let frame = 0; frame < frames; frame++) {
    await page.evaluate((time) => window.render(time), frame / FPS);
    const png = await page.screenshot();
    if (!ffmpeg.stdin.write(png)) await new Promise((done) => ffmpeg.stdin.once("drain", done));
    if (frame % 150 === 0) console.log(`frame ${frame}/${frames}`);
  }
  ffmpeg.stdin.end();
  await new Promise((done, fail) =>
    ffmpeg.on("close", (code) => (code === 0 ? done() : fail(new Error(`ffmpeg exited ${code}`)))),
  );
}
await browser.close();

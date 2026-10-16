// Run with Node >=20 after installing only production dependencies in each clean
// source tree (e.g. npm install --ignore-scripts --omit=dev --no-save).
// Optional BASE_SOURCE and HEAD_SOURCE select those source trees; defaults are
// the adjacent exact-revision evidence checkouts used for this artifact.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync, writeFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";

const root = resolve(import.meta.dirname);
const baseDir = resolve(process.env.BASE_SOURCE ?? join(root, "source-base"));
const headDir = resolve(process.env.HEAD_SOURCE ?? join(root, "source-pr91"));
const BASE = "ad39187dd6063734d45cd932f3424344434d188d";
const HEAD = "8968c3588f1d1f39006540ec2862a91ae7cddc26";
assert.equal(execFileSync("git", ["-C", headDir, "rev-parse", "HEAD"], {encoding: "utf8"}).trim(), HEAD);
assert.equal(
  readFileSync(join(baseDir, "src/clip/polygon.js"), "utf8").replace(/\r\n/g, "\n"),
  execFileSync("git", ["-C", headDir, "show", `${BASE}:src/clip/polygon.js`], {encoding: "utf8"}).replace(/\r\n/g, "\n")
);

const polygon = {
  type: "Polygon",
  coordinates: [
    [[-20, -20], [-20, 20], [20, 20], [20, -20], [-20, -20]],
    [[-5, -5], [5, -5], [5, 5], [-5, 5], [-5, -5]]
  ]
};
const subject = {type: "LineString", coordinates: [[-30, 0], [30, 0]]};
const panels = [];
for (const [label, sourceDir, expected] of [
  ["Base", baseDir, "M40,130L180,130"],
  ["PR #91", headDir, "M40,130L92.5,130M127.5,130L180,130"]
]) {
  const [{geoClipPolygon}, {geoEquirectangular, geoPath}] = await Promise.all([
    import(pathToFileURL(join(sourceDir, "src/index.js"))),
    import(pathToFileURL(join(sourceDir, "node_modules/d3-geo/src/index.js")))
  ]);
  const projection = geoEquirectangular()
    .scale(3.5 * 180 / Math.PI)
    .translate([110, 130])
    .precision(0)
    .preclip(geoClipPolygon(polygon));
  const path = geoPath(projection);
  const d = path(subject);
  assert.equal(d, expected, `${label}: actual public-source clipping path`);
  const outline = geoPath(geoEquirectangular().scale(3.5 * 180 / Math.PI).translate([110, 130]).precision(0));
  const boundary = outline(polygon);
  panels.push({label, d, boundary});
}

// Analytic equatorial oracle: the allowed shell is [-20,20] degrees; the hole
// removes [-5,5], so the retained intervals are [-20,-5] and [5,20]. At 3.5 px/degree
// and x-translation 110, these become [40,92.5] and [127.5,180].
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 250" role="img" aria-labelledby="title desc">
<title id="title">Spherical polygon clipping before and after PR #91</title>
<desc id="desc">Same analytic polygon and equatorial line rendered through the base and PR #91 public clipping implementations. The base draws across the hole; PR #91 leaves the hole interval blank.</desc>
<style>text{font:14px sans-serif;fill:#17212b}.panel{fill:#fafafa;stroke:#aab4be}.allowed{fill:#d9f0df;fill-rule:evenodd;stroke:#287a45;stroke-width:1.5}.hole{fill:#fff;stroke:#bd4d4d;stroke-dasharray:4 3}.line{fill:none;stroke:#1459a6;stroke-width:4;stroke-linecap:round}.tick{stroke:#17212b;stroke-width:1}.sub{font-size:12px;fill:#46515c}</style>
<text x="220" y="22" text-anchor="middle" font-weight="bold">Same spherical fixture · same equirectangular view</text>
${panels.map(({label, d, boundary}, i) => {
  const x = 10 + i * 215;
  const dx = i * 215;
  return `<g transform="translate(${dx},0)"><rect class="panel" x="${x}" y="35" width="205" height="195" rx="5"/><text x="${x + 102.5}" y="58" text-anchor="middle" font-weight="bold">${label}</text>
<path class="allowed" d="${boundary}"/>
<path class="hole" d="M92.5,147.5L127.5,147.5L127.5,112.5L92.5,112.5Z"/>
<path class="line" d="${d}"/>
<path class="tick" d="M40,170v6 M92.5,170v6 M127.5,170v6 M180,170v6"/>
<text class="sub" x="40" y="192" text-anchor="middle">−20°</text><text class="sub" x="92.5" y="192" text-anchor="middle">−5°</text><text class="sub" x="127.5" y="192" text-anchor="middle">+5°</text><text class="sub" x="180" y="192" text-anchor="middle">+20°</text>
<text class="sub" x="${x + 102.5}" y="205" text-anchor="middle">blue = clipped input line · red box = hole</text></g>`;
}).join("\n")}
</svg>
`;
writeFileSync(join(root, "pr91-hole-before-after.svg"), svg);
console.log(JSON.stringify({base: BASE, head: HEAD, analyticAllowedIntervalsDegrees: [[-20, -5], [5, 20]], paths: panels, output: "pr91-hole-before-after.svg"}, null, 2));

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public", "cards");

const SUIT = { S: "spade", H: "heart", D: "diamond", C: "club" };
const RANK = { A: "ace", T: "10", J: "jack", Q: "queen", K: "king" };

function mapName(file) {
  if (file === "1B.svg" || file === "2B.svg") return "joker_black.svg";
  if (file === "1J.svg" || file === "2J.svg") return "joker_red.svg";
  const m = file.match(/^([A2-9TJQK])([SHDC])\.svg$/);
  if (!m) return null;
  const rank = RANK[m[1]] ?? m[1];
  return `${SUIT[m[2]]}_${rank}.svg`;
}

const res = await fetch("https://www.me.uk/cards/makeadeck.cgi", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: "fourcolour=on&zip=Download+zip+file+of+SVG+for+web+use",
});
if (!res.ok) throw new Error(`deck download failed: ${res.status}`);

const zipPath = join(ROOT, "deck.zip");
writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));

mkdirSync(OUT_DIR, { recursive: true });
const py = `
import zipfile, sys, os
zip_path, out_dir = sys.argv[1], sys.argv[2]
suit = {"S":"spade","H":"heart","D":"diamond","C":"club"}
rank = {"A":"ace","T":"10","J":"jack","Q":"queen","K":"king"}
def map_name(f):
    if f in ("1B.svg","2B.svg"): return "joker_black.svg"
    if f in ("1J.svg","2J.svg"): return "joker_red.svg"
    m = __import__("re").match(r"^([A2-9TJQK])([SHDC])\\.svg$", f)
    if not m: return None
    return f"{suit[m.group(2)]}_{rank.get(m.group(1), m.group(1))}.svg"
n = 0
with zipfile.ZipFile(zip_path) as z:
    for name in z.namelist():
        target = map_name(name)
        if not target: continue
        data = z.read(name)
        with open(os.path.join(out_dir, target), "wb") as fh:
            fh.write(data)
        n += 1
print(n)
`;
const written = execFileSync("python3", ["-c", py, zipPath, OUT_DIR], { encoding: "utf8" }).trim();
execFileSync("rm", ["-f", zipPath]);
console.log(`Fetched 4-colour deck: wrote ${written} card SVGs to ${OUT_DIR}`);

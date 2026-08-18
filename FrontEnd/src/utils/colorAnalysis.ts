// Extracts a coarse "dominant color" name from an image File or HTMLVideoElement
// frame. Runs entirely in the browser using Canvas — no backend call required.
//
// We average pixel RGB values then map to the nearest of a small set of color
// names that the backend's parser understands (white/black/red/blue/...).

const PALETTE: Array<{ name: string; r: number; g: number; b: number }> = [
  { name: "white", r: 240, g: 240, b: 240 },
  { name: "black", r: 20, g: 20, b: 20 },
  { name: "gray", r: 128, g: 128, b: 128 },
  { name: "red", r: 200, g: 30, b: 30 },
  { name: "blue", r: 30, g: 80, b: 200 },
  { name: "green", r: 40, g: 160, b: 60 },
  { name: "yellow", r: 230, g: 220, b: 60 },
  { name: "orange", r: 230, g: 130, b: 40 },
  { name: "purple", r: 130, g: 50, b: 180 },
  { name: "pink", r: 240, g: 150, b: 180 },
  { name: "brown", r: 120, g: 70, b: 40 },
  { name: "beige", r: 220, g: 200, b: 170 },
];

function nearestColorName(r: number, g: number, b: number): string {
  let best = PALETTE[0];
  let bestD = Infinity;
  for (const c of PALETTE) {
    const d = (c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best.name;
}

function averageFromCanvas(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  // sample every 8th pixel for performance
  for (let i = 0; i < data.length; i += 4 * 8) {
    const a = data[i + 3];
    if (a < 128) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  }
  if (n === 0) return "";
  return nearestColorName(r / n, g / n, b / n);
}

export function dominantColorFromFile(file: File): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const W = 64,
        H = 64;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve("");
        return;
      }
      ctx.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(url);
      resolve(averageFromCanvas(c));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve("");
    };
    img.src = url;
  });
}

export function dominantColorFromVideo(video: HTMLVideoElement): string {
  const W = 64,
    H = 64;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(video, 0, 0, W, H);
  return averageFromCanvas(c);
}

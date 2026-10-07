export interface Rendition {
  name: string;
  size: number;
  videoBitrate: number;
}

export const HLS_LADDER: Rendition[] = [
  { name: '720p', size: 720, videoBitrate: 2800 },
  { name: '480p', size: 480, videoBitrate: 1400 },
];

export function pickRenditions(width: number, height: number): Rendition[] {
  const shortSide = Math.min(width, height);
  const fitting = HLS_LADDER.filter((rendition) => rendition.size <= shortSide);
  if (fitting.length > 0) {
    return fitting;
  }

  const size = shortSide - (shortSide % 2);
  const smallest = HLS_LADDER[HLS_LADDER.length - 1];

  return [{ name: `${size}p`, size, videoBitrate: smallest.videoBitrate }];
}

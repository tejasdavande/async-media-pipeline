import { pickRenditions } from './hls-ladder';

describe('pickRenditions', () => {
  it('uses the full ladder for a 1080p source', () => {
    expect(pickRenditions(1920, 1080).map((r) => r.name)).toEqual(['720p', '480p']);
  });

  it('drops renditions bigger than the source', () => {
    expect(pickRenditions(854, 480).map((r) => r.name)).toEqual(['480p']);
  });

  it('sizes portrait video by its short side', () => {
    expect(pickRenditions(1080, 1920).map((r) => r.name)).toEqual(['720p', '480p']);
  });

  it('keeps a small source at its own size instead of upscaling', () => {
    expect(pickRenditions(640, 361)).toEqual([{ name: '360p', size: 360, videoBitrate: 1400 }]);
  });
});

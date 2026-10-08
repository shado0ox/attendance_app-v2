import { PNG } from 'pngjs';
export function signatureFixture(blank = false) {
  const png = new PNG({width:32,height:16});
  if (!blank) for (let x=4;x<28;x++) { const i=(8*32+x)*4; png.data[i+3]=255; }
  return 'data:image/png;base64,' + PNG.sync.write(png).toString('base64');
}

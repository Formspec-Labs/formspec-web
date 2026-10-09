import process from 'node:process';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
sharp.cache(false);
sharp.concurrency(1);
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = Buffer.concat(chunks);
try {
  const decoder = sharp(input, { failOn: 'warning', limitInputPixels: Number(process.argv[2]), limitInputChannels: 4, unlimited: false });
  const metadata = await decoder.metadata();
  if ((metadata.pages ?? 1) !== 1) {
    process.stdout.write(JSON.stringify({ status: 'unsupported', reason: 'multiple-pages' }));
  } else {
    const { data, info } = await decoder.toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let chromaticPixels = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i] !== data[i + 1] || data[i + 1] !== data[i + 2]) chromaticPixels++;
    }
    process.stdout.write(JSON.stringify({ status: 'decoded', format: metadata.format, width: info.width, height: info.height,
      pixelCount: info.width * info.height, chromaticPixels, colorObservation: 'unequal decoded sRGB components; not portrait color compliance', decoder: { sharp: sharp.versions.sharp, vips: sharp.versions.vips } }));
  }
} catch {
  // Do not mistake an unavailable codec or budget refusal for corrupt applicant bytes.
  process.stdout.write(JSON.stringify({ status: 'inconclusive', reason: 'decoder-refused-or-codec-unavailable' }));
}

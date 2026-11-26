// 把 public/rentals 下 AI 生成的房源大图压缩成 webp，并改成可预测的英文文件名
// 用法：node scripts/compress-rental-images.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const DIR = path.resolve('public/rentals');

const MAP = [
  { key: '客厅', out: 'whole' },
  { key: '主卧', out: 'shared' },
  { key: '单间', out: 'single' },
  { key: '床位', out: 'bed' },
  { key: '标准间', out: 'daily' },
  { key: 'loft', out: 'apt' },
];

const files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.png'));
let done = 0;

for (const file of files) {
  const hit = MAP.find((m) => file.toLowerCase().includes(m.key.toLowerCase()));
  if (!hit) {
    console.log(`跳过（未匹配房型）：${file}`);
    continue;
  }

  const src = path.join(DIR, file);
  const out = path.join(DIR, `${hit.out}.webp`);

  await sharp(src)
    .resize(880, 660, { fit: 'cover', position: 'centre' })
    .webp({ quality: 72 })
    .toFile(out);

  const before = (fs.statSync(src).size / 1024 / 1024).toFixed(2);
  const after = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`${hit.out}.webp  ${before}MB -> ${after}KB`);
  fs.unlinkSync(src);
  done += 1;
}

console.log(`完成 ${done} 张`);

import fs from 'fs';
import path from 'path';

const fontsDir = path.join(process.cwd(), 'public/fonts');

export function loadInterFonts() {
  return [
    {
      name: 'Inter',
      data: fs.readFileSync(path.join(fontsDir, 'Inter-Regular.ttf')),
      weight: 400 as const,
      style: 'normal' as const,
    },
    {
      name: 'Inter',
      data: fs.readFileSync(path.join(fontsDir, 'Inter-Bold.ttf')),
      weight: 700 as const,
      style: 'normal' as const,
    },
  ];
}

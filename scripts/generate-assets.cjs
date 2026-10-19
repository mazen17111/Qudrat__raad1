const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const publicDir = path.join(__dirname, '..', 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const faviconSvg = fs.readFileSync(path.join(publicDir, 'favicon.svg'));
  const ogSvg = fs.readFileSync(path.join(publicDir, 'og-image.svg'));

  console.log('Generating og-image.png...');
  await sharp(ogSvg)
    .resize(1200, 630)
    .png()
    .toFile(path.join(publicDir, 'og-image.png'));

  console.log('Generating icons...');
  await sharp(faviconSvg).resize(512, 512).png().toFile(path.join(publicDir, 'icon-512.png'));
  await sharp(faviconSvg).resize(192, 192).png().toFile(path.join(publicDir, 'icon-192.png'));
  await sharp(faviconSvg).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon.png'));
  await sharp(faviconSvg).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon-precomposed.png'));
  await sharp(faviconSvg).resize(96, 96).png().toFile(path.join(publicDir, 'favicon-96x96.png'));
  await sharp(faviconSvg).resize(48, 48).png().toFile(path.join(publicDir, 'favicon-48x48.png'));
  await sharp(faviconSvg).resize(32, 32).png().toFile(path.join(publicDir, 'favicon-32x32.png'));
  await sharp(faviconSvg).resize(16, 16).png().toFile(path.join(publicDir, 'favicon-16x16.png'));
  
  // favicon.png & favicon.ico
  fs.copyFileSync(path.join(publicDir, 'icon-192.png'), path.join(publicDir, 'favicon.png'));
  fs.copyFileSync(path.join(publicDir, 'favicon-32x32.png'), path.join(publicDir, 'favicon.ico'));

  // Also create manifest.json
  const manifest = {
    name: "منصة أقسام رعد",
    short_name: "أقسام رعد",
    description: "منصة تعليمية متكاملة تشمل الفيديوهات والاختبارات التفاعلية والسبورة الذكية والإحصائيات ومجلدات الطلاب.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      }
    ]
  };
  fs.writeFileSync(path.join(publicDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('All brand assets successfully generated!');
}

main().catch((err) => {
  console.error('Error generating assets:', err);
  process.exit(1);
});

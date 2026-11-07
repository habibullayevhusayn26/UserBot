const { Bot, InputFile } = require('grammy');
const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const bot = new Bot(process.env.BOT_TOKEN);

const ALLOWED = /(instagram\.com|tiktok\.com|youtube\.com|youtu\.be|pinterest\.com|pin\.it|likee\.video|likee\.com|l\.likee\.video)/i;
const URL_RE = /https?:\/\/[^\s]+/i;
const VIDEO_EXT = ['.mp4', '.mov', '.webm', '.mkv'];
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

function download(url, dir) {
  return new Promise((resolve, reject) => {
    const args = [
      '-o', path.join(dir, '%(id)s_%(autonumber)s.%(ext)s'),
      '-f', 'best[filesize<50M]/bv*[filesize<45M]+ba/best',
      '--merge-output-format', 'mp4',
      '--max-filesize', '50M',
      '--playlist-end', '10',
      '--no-warnings',
      url,
    ];
    execFile('yt-dlp', args, { timeout: 120000 }, (err, _out, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve();
    });
  });
}

bot.command('start', (ctx) =>
  ctx.reply(
    "Salom! Instagram, TikTok, YouTube, Pinterest yoki Likee havolasini yuboring, men yuklab beraman."
  )
);

bot.on('message:text', async (ctx) => {
  const match = ctx.message.text.match(URL_RE);
  if (!match || !ALLOWED.test(match[0])) {
    return ctx.reply("Iltimos, qo'llab-quvvatlanadigan platformadan havola yuboring.");
  }

  const status = await ctx.reply('Yuklanmoqda...');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dl-'));

  try {
    await download(match[0], dir);
    const files = (await fs.readdir(dir)).sort();
    if (!files.length) throw new Error('Fayl topilmadi');

    for (const f of files) {
      const full = path.join(dir, f);
      const ext = path.extname(f).toLowerCase();
      if (VIDEO_EXT.includes(ext)) {
        await ctx.replyWithVideo(new InputFile(full), { supports_streaming: true });
      } else if (IMAGE_EXT.includes(ext)) {
        await ctx.replyWithPhoto(new InputFile(full));
      } else {
        await ctx.replyWithDocument(new InputFile(full));
      }
    }
  } catch (e) {
    console.error(e.message);
    await ctx.reply("Yuklab bo'lmadi. Havola yopiq bo'lishi yoki fayl 50 MB dan katta bo'lishi mumkin.");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
    ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {});
  }
});

// Render uchun: web service port ochib turishi kerak
require('node:http')
  .createServer((_req, res) => res.end('OK'))
  .listen(process.env.PORT || 3000);

bot.catch((err) => console.error('Bot xatosi:', err.message));
bot.start();
console.log('Bot ishga tushdi');

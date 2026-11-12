/**
 * The 反馈 button and its dialog: text plus up to 4 images (picked, pasted or dropped), posted to /api/feedback
 * (functions/api/feedback). Big images are downscaled in the browser first so screenshots upload quickly.
 */
const MAX_IMAGES = 4;
const MAX_EDGE = 2400;
const SHRINK_OVER = 1.5 * 1024 * 1024;

/** Re-encodes an oversized image as a JPEG no larger than MAX_EDGE; anything that fails is sent as it is. */
async function shrink(file: File): Promise<File> {
  if (file.size <= SHRINK_OVER || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

export function installFeedback() {
  const open = document.createElement('button');
  open.id = 'feedback-open';
  open.type = 'button';
  open.textContent = '反馈';
  open.title = '反馈问题或建议';
  document.body.append(open);

  const dlg = document.createElement('dialog');
  dlg.id = 'feedback';
  dlg.innerHTML = `
    <form method="dialog">
      <h2>反馈</h2>
      <p class="hint">数据有误、缺少地点、功能建议都可以写在这里。</p>
      <textarea name="message" rows="5" maxlength="4000" placeholder="想说点什么…（可直接粘贴截图）"></textarea>
      <div class="thumbs"></div>
      <label class="pick"><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden />＋ 添加图片（最多 ${MAX_IMAGES} 张）</label>
      <input name="contact" type="text" maxlength="200" placeholder="联系方式（选填，不会公开）" autocomplete="off" />
      <input name="website" type="text" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true" />
      <p class="hint">反馈的文字和图片会公开同步到本站的 GitHub 仓库 issue，请勿包含隐私信息。</p>
      <p class="status" role="status"></p>
      <div class="buttons">
        <button type="button" class="cancel">取消</button>
        <button type="submit" class="send">提交</button>
      </div>
    </form>`;
  document.body.append(dlg);

  const form = dlg.querySelector('form')!;
  const message = form.querySelector('textarea')!;
  const picker = form.querySelector<HTMLInputElement>('input[type=file]')!;
  const thumbs = form.querySelector<HTMLElement>('.thumbs')!;
  const status = form.querySelector<HTMLElement>('.status')!;
  const send = form.querySelector<HTMLButtonElement>('.send')!;
  let images: File[] = [];

  const say = (text: string, kind: '' | 'error' | 'ok' = '') => {
    status.textContent = text;
    status.className = `status ${kind}`;
  };

  const renderThumbs = () => {
    thumbs.replaceChildren(...images.map((f, i) => {
      const box = document.createElement('span');
      const img = document.createElement('img');
      img.src = URL.createObjectURL(f);
      img.onload = () => URL.revokeObjectURL(img.src);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.textContent = '×';
      rm.title = '移除';
      rm.onclick = () => {
        images.splice(i, 1);
        renderThumbs();
      };
      box.append(img, rm);
      return box;
    }));
  };

  const addImages = async (files: Iterable<File>) => {
    const picked = [...files].filter((f) => /^image\/(png|jpeg|gif|webp)$/.test(f.type));
    if (!picked.length) return;
    if (images.length + picked.length > MAX_IMAGES) say(`最多 ${MAX_IMAGES} 张图片`, 'error');
    else say('');
    images = images.concat(await Promise.all(picked.slice(0, MAX_IMAGES - images.length).map(shrink)));
    renderThumbs();
  };

  picker.addEventListener('change', () => {
    void addImages(picker.files ?? []);
    picker.value = '';
  });
  dlg.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.length) {
      e.preventDefault();
      void addImages(files);
    }
  });
  dlg.addEventListener('dragover', (e) => e.preventDefault());
  dlg.addEventListener('drop', (e) => {
    e.preventDefault();
    void addImages(e.dataTransfer?.files ?? []);
  });

  open.addEventListener('click', () => {
    say('');
    dlg.showModal();
    message.focus();
  });
  form.querySelector('.cancel')!.addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close(); // click on the backdrop
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!message.value.trim() && !images.length) return say('请填写反馈内容或附上图片', 'error');
    const body = new FormData(form);
    body.set('page', location.pathname);
    for (const f of images) body.append('images', f);
    send.disabled = true;
    say('提交中…');
    try {
      const res = await fetch('/api/feedback', { method: 'POST', body });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || `提交失败（${res.status}）`);
      form.reset();
      images = [];
      renderThumbs();
      say('已收到，感谢反馈！', 'ok');
      setTimeout(() => dlg.open && status.classList.contains('ok') && dlg.close(), 1600);
    } catch (err) {
      say(err instanceof TypeError ? '网络错误，请稍后重试' : (err as Error).message, 'error');
    } finally {
      send.disabled = false;
    }
  });
}

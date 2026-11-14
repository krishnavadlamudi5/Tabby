// Reads text from a PDF or photo ON THE DEVICE (nothing is uploaded for this):
//  - text PDFs: pdf.js text layer (fast, exact)
//  - scanned PDFs and photos: render pages and run Tesseract OCR (free, open source)
// Both libraries are loaded only when first needed.

export type Progress = (message: string) => void;

const MIN_TEXT = 80;

async function loadPdfjs() {
  const pdfjs: any = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker: any = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  return pdfjs;
}

async function ocrImages(images: (HTMLCanvasElement | Blob)[], progress?: Progress): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  progress?.('Loading the text scanner (first time only)…');
  const worker = await createWorker('eng');
  try {
    const out: string[] = [];
    for (let i = 0; i < images.length; i++) {
      progress?.(`Scanning ${images.length > 1 ? `page ${i + 1} of ${images.length}` : 'image'}…`);
      const { data } = await worker.recognize(images[i] as any);
      out.push(data.text);
    }
    return out.join('\n');
  } finally {
    await worker.terminate();
  }
}

/**
 * Returns the text of a PDF or image. `askPassword` is called for locked
 * PDFs (insurers often use your date of birth); return null to give up.
 */
export async function documentToText(file: Blob, opts: { progress?: Progress; askPassword?: (wrong: boolean) => Promise<string | null> } = {}): Promise<{ text: string; method: 'pdf-text' | 'ocr' }> {
  const isPdf = file.type === 'application/pdf' || (file as File).name?.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    return { text: await ocrImages([file], opts.progress), method: 'ocr' };
  }
  opts.progress?.('Opening PDF…');
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  let password: string | undefined;
  let doc: any;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      doc = await pdfjs.getDocument({ data: data.slice(), password }).promise;
      break;
    } catch (err: any) {
      if (err?.name !== 'PasswordException' || !opts.askPassword) throw err;
      const p = await opts.askPassword(attempt > 0);
      if (!p) throw new Error('The PDF is password protected.');
      password = p;
    }
  }
  if (!doc) throw new Error('Could not open the PDF.');

  const pages = Math.min(doc.numPages, 6);
  const texts: string[] = [];
  for (let i = 1; i <= pages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    texts.push(content.items.map((it: any) => it.str).join(' '));
  }
  const text = texts.join('\n');
  if (text.replace(/\s/g, '').length >= MIN_TEXT) return { text, method: 'pdf-text' };

  // Scanned PDF: render pages to images and OCR them.
  const canvases: HTMLCanvasElement[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 4); i++) {
    opts.progress?.(`Preparing page ${i}…`);
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport, canvas }).promise;
    canvases.push(canvas);
  }
  return { text: await ocrImages(canvases, opts.progress), method: 'ocr' };
}

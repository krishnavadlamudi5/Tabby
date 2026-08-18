import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import { requireAuth, AuthedRequest } from '../middleware/auth';

const router = Router();

// The Gemini client used to be constructed in the browser with
// VITE_GEMINI_API_KEY, which Vite inlines directly into the shipped JS
// bundle - anyone could extract it from the built app/APK and rack up usage
// on it. GEMINI_API_KEY (no VITE_ prefix, so Vite never bundles it) is only
// ever read here, server-side.
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Receipt scanning calls a paid external API per request - cap it separately
// from the general data routes so a compromised/careless client can't run up
// an unbounded bill.
const scanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many receipt scans. Please wait a few minutes and try again.' },
});

router.use(requireAuth);

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // matches the client-side cap

// POST /api/receipt/scan - { mimeType, data } where `data` is the base64
// image payload (no data: URI prefix). Returns the parsed { items, tax, total }.
router.post('/scan', scanLimiter, async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    if (!ai) {
      res.status(503).json({ error: 'Receipt scanning is not configured on the server (missing GEMINI_API_KEY).' });
      return;
    }

    const { mimeType, data } = req.body;
    if (!mimeType || !data || typeof data !== 'string') {
      res.status(400).json({ error: 'mimeType and base64 image data are required.' });
      return;
    }
    if (!mimeType.startsWith('image/')) {
      res.status(400).json({ error: 'Only image files are supported.' });
      return;
    }
    // Rough byte-size check on the base64 payload (base64 is ~4/3 the size
    // of the raw bytes) - rejects oversized uploads before spending a Gemini
    // call on them.
    const approxBytes = Math.floor((data.length * 3) / 4);
    if (approxBytes > MAX_IMAGE_BYTES) {
      res.status(400).json({ error: 'Image is too large. Please upload an image under 4MB.' });
      return;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `You are an expert receipt parsing assistant. Extract all line items, their prices, any tax, and the final total from the provided receipt image.
              Return the data STRICTLY as a JSON object with this exact schema (no markdown formatting, no backticks, just raw JSON):
              {
                "items": [
                  { "name": "Item Name", "price": 10.50 }
                ],
                "tax": 2.50,
                "total": 13.00
              }`
            },
            {
              inlineData: {
                mimeType,
                data
              }
            }
          ]
        }
      ]
    });

    const resultText = response.text || '{}';
    const cleanJson = resultText.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      res.status(502).json({ error: 'Could not read the receipt clearly. Please try again with a clearer photo.' });
      return;
    }

    if (!parsed.items || !Array.isArray(parsed.items)) {
      res.status(422).json({ error: 'Could not detect items clearly. Please try again with a clearer photo.' });
      return;
    }

    res.json({
      success: true,
      items: parsed.items,
      total: parsed.total || 0,
      tax: parsed.tax || 0,
    });
  } catch (error: any) {
    console.error('Receipt scan error:', error);
    const message = error?.message?.includes('API key not valid')
      ? 'Receipt scanning is misconfigured on the server. Please contact support.'
      : (error.message || 'Failed to parse the receipt. Please make sure the image is clear and try again.');
    res.status(500).json({ error: message });
  }
});

export default router;

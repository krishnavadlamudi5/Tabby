import { Capacitor } from '@capacitor/core';
import type { Policy } from './types';

// Official websites, used by the "Renew" button. A policy's own renewUrl
// (editable on the policy) always wins. Unknown insurers fall back to a web
// search for "<insurer> renew policy".
const OFFICIAL: [RegExp, string][] = [
  [/acko/i, 'https://www.acko.com/'],
  [/digit/i, 'https://www.godigit.com/'],
  [/icici lombard/i, 'https://www.icicilombard.com/'],
  [/hdfc ergo/i, 'https://www.hdfcergo.com/'],
  [/bajaj allianz life/i, 'https://www.bajajallianzlife.com/'],
  [/bajaj allianz/i, 'https://www.bajajallianz.com/'],
  [/tata aig/i, 'https://www.tataaig.com/'],
  [/tata aia/i, 'https://www.tataaia.com/'],
  [/care health/i, 'https://www.careinsurance.com/'],
  [/niva bupa/i, 'https://www.nivabupa.com/'],
  [/star health/i, 'https://www.starhealth.in/'],
  [/manipalcigna/i, 'https://www.manipalcigna.com/'],
  [/sbi general/i, 'https://www.sbigeneral.in/'],
  [/sbi life/i, 'https://www.sbilife.co.in/'],
  [/reliance general/i, 'https://www.reliancegeneral.co.in/'],
  [/new india/i, 'https://www.newindia.co.in/'],
  [/united india/i, 'https://uiic.co.in/'],
  [/oriental/i, 'https://orientalinsurance.org.in/'],
  [/chola/i, 'https://www.cholainsurance.com/'],
  [/iffco tokio/i, 'https://www.iffcotokio.co.in/'],
  [/royal sundaram/i, 'https://www.royalsundaram.in/'],
  [/^lic$|life insurance corporation/i, 'https://licindia.in/'],
  [/hdfc life/i, 'https://www.hdfclife.com/'],
  [/icici pru/i, 'https://www.iciciprulife.com/'],
  [/max life/i, 'https://www.axismaxlife.com/'],
  [/kotak life/i, 'https://www.kotaklife.com/'],
  [/policybazaar/i, 'https://www.policybazaar.com/'],
];

export function renewLink(p: Pick<Policy, 'insurer' | 'renewUrl'>): { url: string; official: boolean } {
  if (p.renewUrl) return { url: p.renewUrl, official: true };
  const hit = OFFICIAL.find(([re]) => re.test(p.insurer));
  if (hit) return { url: hit[1], official: true };
  return { url: `https://www.google.com/search?q=${encodeURIComponent(`${p.insurer} renew policy official site`)}`, official: false };
}

/** Opens a link in the system browser (Android) or a new tab (web). */
export async function openExternal(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

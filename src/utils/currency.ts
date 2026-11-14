/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  locale: string;
}

export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar ($)', locale: 'en-US' },
  { code: 'EUR', symbol: '€', name: 'Euro (€)', locale: 'de-DE' },
  { code: 'GBP', symbol: '£', name: 'British Pound (£)', locale: 'en-GB' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee (₹)', locale: 'en-IN' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen (¥)', locale: 'ja-JP' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar (CA$)', locale: 'en-CA' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar (A$)', locale: 'en-AU' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar (S$)', locale: 'en-SG' },
  { code: 'AED', symbol: 'AED ', name: 'UAE Dirham (AED)', locale: 'ar-AE' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real (R$)', locale: 'pt-BR' },
  { code: 'CHF', symbol: 'CHF ', name: 'Swiss Franc (CHF)', locale: 'de-CH' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso (MX$)', locale: 'es-MX' },
];

export const DEFAULT_CURRENCY = 'INR';

export function getCurrencyConfig(code: string): CurrencyConfig {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code) || SUPPORTED_CURRENCIES[0];
}

export function formatAmount(amount: number, currencyCode: string = 'INR', showSign: boolean = false): string {
  const config = getCurrencyConfig(currencyCode);
  const absoluteAmount = Math.abs(amount);

  let formattedNum: string;
  if (config.code === 'JPY') {
    formattedNum = Math.round(absoluteAmount).toLocaleString(config.locale);
  } else {
    formattedNum = absoluteAmount.toLocaleString(config.locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  const signStr = showSign ? (amount > 0.001 ? '+ ' : amount < -0.001 ? '- ' : '') : (amount < -0.001 ? '- ' : '');
  
  return `${signStr}${config.symbol}${formattedNum}`;
}

/**
 * Finance amounts are integer paise (₹331.00 -> 33100). Convert only here,
 * at the UI edge. Non-INR amounts use their own minor unit (cents).
 */
export function formatPaise(paise: number, currencyCode: string = 'INR', showSign: boolean = false): string {
  return formatAmount(paise / 100, currencyCode, showSign);
}

/** "1,320.50" / "₹1320" -> 132050 paise, or null if it isn't a number. */
export function rupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [i, f = ''] = cleaned.split('.');
  return Number(i) * 100 + Number((f + '00').slice(0, 2));
}

/** 132050 -> "1320.50" for editable inputs. */
export function paiseToInput(paise: number): string {
  return (paise / 100).toFixed(2).replace(/\.00$/, '');
}

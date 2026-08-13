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

export const DEFAULT_CURRENCY = 'USD';

export function getCurrencyConfig(code: string): CurrencyConfig {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code) || SUPPORTED_CURRENCIES[0];
}

export function formatAmount(amount: number, currencyCode: string = 'USD', showSign: boolean = false): string {
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

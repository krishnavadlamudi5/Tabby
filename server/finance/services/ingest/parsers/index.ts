import { Parser } from '../types';
import { kotakParser } from './kotak';
import { iciciParser } from './icici';
import { sbmParser } from './sbm';
import { hdfcParser } from './hdfc';
import { smsParser } from './sms';
import { razorpayParser, payuParser, flipkartParser, zerodhaParser, stripeParser, orderParser } from './merchants';

/** Known senders. Anything else goes to the review queue (no AI). */
export const PARSERS: Parser[] = [
  smsParser,
  kotakParser, iciciParser, sbmParser, hdfcParser,
  razorpayParser, payuParser, flipkartParser, zerodhaParser, stripeParser, orderParser,
];

export function findParser(sender: string, subject: string): Parser | undefined {
  return PARSERS.find((p) => p.matches(sender, subject));
}

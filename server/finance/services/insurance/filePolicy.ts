import { Types } from 'mongoose';
import { User } from '../../../models/User';
import { DocPassword, FinDocument, IPolicy, Policy, RawEvent } from '../../models';
import { decryptString } from '../../lib/crypto';
import { addDays } from '../../lib/time';
import { formatPaiseINR } from '../../lib/money';
import { extractPolicy, isUsable, mergeExtractions, PolicyExtraction } from './policyExtract';
import { aiExtractPolicy } from '../ai/cloudflare';
import { pdfToText } from '../statements/pdfText';
import { normaliseBody } from '../ingest/text';
import { linkPremiums, syncPremiumCommitment } from '../insurance';
import { raiseAlert } from '../alerts';

/** Sets fields on a raw event, merging into `extracted` even when it is null. */
async function updateRaw(ownerId: string, rawEventId: string, set: Record<string, unknown>, extracted: Record<string, unknown>) {
  await RawEvent.updateOne({ _id: new Types.ObjectId(rawEventId), ownerId }, [
    { $set: { ...set, extracted: { $mergeObjects: [{ $ifNull: ['$extracted', {}] }, { $literal: extracted }] } } },
  ], { updatePipeline: true } as any);
}

export interface PolicyEvidence {
  sender: string;
  subject: string;
  bodyText: string;
  receivedAt: Date;
  pdfs: { buffer: Buffer; documentId?: string }[];
}

export async function ownerDocPasswords(ownerId: string): Promise<string[]> {
  const list = await DocPassword.find({ ownerId });
  return list.map((p) => {
    try {
      return decryptString(p.passwordEnc);
    } catch {
      return '';
    }
  }).filter(Boolean);
}

/** Reads email body + PDFs (labels first, then optional AI). */
export async function readPolicyEvidence(ownerId: string, ev: PolicyEvidence): Promise<{ extraction: PolicyExtraction; scanned: boolean; locked: boolean; text: string }> {
  const passwords = await ownerDocPasswords(ownerId);
  const parts: PolicyExtraction[] = [];
  const texts: string[] = [];
  let scanned = false;
  let locked = false;
  for (const pdf of ev.pdfs) {
    try {
      const { text } = await pdfToText(pdf.buffer, passwords);
      if (text.replace(/\s/g, '').length < 80) {
        scanned = true;
        continue;
      }
      texts.push(text);
      parts.push(extractPolicy(text, ev.sender, ev.subject));
    } catch (err: any) {
      if (err?.code === 'password_needed') locked = true;
    }
  }
  const body = normaliseBody(ev.bodyText || '');
  texts.push(body);
  parts.push(extractPolicy(body, ev.sender, ev.subject));
  let extraction = mergeExtractions(parts);
  const text = texts.join('\n\n');
  if (!isUsable(extraction)) {
    const owner = await User.findOne({ id: ownerId });
    const ai = await aiExtractPolicy(`${ev.subject}\n${text}`, owner?.name || '');
    if (ai) extraction = mergeExtractions([extraction, ai]);
  }
  return { extraction, scanned, locked, text };
}

function taxSectionFor(type?: string): '80C' | '80D' | null {
  if (type === 'health') return '80D';
  if (type === 'life' || type === 'term_life') return '80C';
  return null;
}

/** Finds the policy this evidence belongs to (renewals keep the same number or vehicle). */
async function findExisting(ownerId: string, x: PolicyExtraction): Promise<IPolicy | null> {
  if (x.policyNumber) {
    const byNumber = await Policy.findOne({ ownerId, policyNumber: x.policyNumber });
    if (byNumber) return byNumber;
  }
  if (x.vehicleNumber) {
    const byVehicle = await Policy.findOne({ ownerId, vehicleNumber: x.vehicleNumber, status: { $ne: 'cancelled' } });
    if (byVehicle) return byVehicle;
  }
  if (x.insurer && x.type && x.startDate) {
    // A renewal often gets a new number: same insurer and type whose renewal
    // date is close to this policy's start.
    return Policy.findOne({
      ownerId, insurer: x.insurer, type: x.type, status: { $ne: 'cancelled' },
      renewalDate: { $gte: addDays(x.startDate, -45), $lte: addDays(x.startDate, 45) },
    });
  }
  return null;
}

/**
 * Creates or updates a policy from evidence, links its documents and
 * premium payment, schedules the renewal reminders, and alerts the owner.
 * Returns null (and leaves the item in Review with a reason) when the
 * details can't be read reliably.
 */
export { updateRaw };

export async function filePolicy(ownerId: string, rawEventId: string | null, ev: PolicyEvidence): Promise<{ policy: IPolicy | null; created: boolean; reason?: string; extraction: PolicyExtraction }> {
  const { extraction: x, scanned, locked } = await readPolicyEvidence(ownerId, ev);
  const docIds = ev.pdfs.map((p) => p.documentId).filter((d): d is string => Boolean(d));

  if (!isUsable(x)) {
    const reason = locked ? 'policy_password_needed' : scanned ? 'policy_scan_needed' : 'policy_suggestion';
    if (rawEventId) {
      await updateRaw(ownerId, rawEventId, { status: 'needs_review', reviewReason: reason, detectedType: 'policy' }, { policy: JSON.parse(JSON.stringify(x)) });
    }
    return { policy: null, created: false, reason, extraction: x };
  }

  const existing = await findExisting(ownerId, x);
  let policy: IPolicy;
  let created = false;
  if (existing) {
    const set: Record<string, any> = { needsCheck: true };
    const later = x.endDate && (!existing.renewalDate || x.endDate > existing.renewalDate);
    if (later) {
      set.renewalDate = x.endDate;
      set.status = 'active';
      if (x.startDate) set.startDate = x.startDate;
      if (x.premiumPaise) set.premiumPaise = x.premiumPaise;
      if (x.sumInsuredPaise) set.sumInsuredPaise = x.sumInsuredPaise;
      if (x.policyNumber) set.policyNumber = x.policyNumber;
    }
    for (const [field, value] of [['planName', x.planName], ['vehicleNumber', x.vehicleNumber], ['nominee', x.nominee]] as const) {
      if (value && !(existing as any)[field]) set[field] = value;
    }
    if (!existing.premiumPaise && x.premiumPaise) set.premiumPaise = x.premiumPaise;
    if (!existing.sumInsuredPaise && x.sumInsuredPaise) set.sumInsuredPaise = x.sumInsuredPaise;
    policy = (await Policy.findOneAndUpdate({ _id: existing._id }, { $set: set, $addToSet: { documentIds: { $each: docIds.map((d) => new Types.ObjectId(d)) } } }, { returnDocument: 'after' }))!;
  } else {
    policy = await Policy.create({
      ownerId,
      insurer: x.insurer,
      policyNumber: x.policyNumber || '',
      type: x.type || 'other',
      planName: x.planName || '',
      vehicleNumber: x.vehicleNumber || '',
      sumInsuredPaise: x.sumInsuredPaise || 0,
      premiumPaise: x.premiumPaise || 0,
      premiumFrequency: 'yearly',
      startDate: x.startDate,
      renewalDate: x.endDate,
      nominee: x.nominee || '',
      status: 'active',
      taxSection: taxSectionFor(x.type),
      documentIds: docIds,
      autoAdded: true,
      needsCheck: true,
      sourceRawEventId: rawEventId ? new Types.ObjectId(rawEventId) : null,
      notes: `Added automatically from "${ev.subject}" (${x.method === 'ai' ? 'read with AI backup' : 'read from the policy text'}). Found: ${x.found.join(', ')}.`,
    });
    created = true;
  }

  for (const id of docIds) {
    await FinDocument.updateOne(
      { _id: id, ownerId, 'linkedTo.id': { $ne: String(policy._id) } },
      { $push: { linkedTo: { kind: 'policy', id: String(policy._id) } }, $set: { type: 'policy' } },
    );
  }
  await syncPremiumCommitment(ownerId, policy);
  await linkPremiums(ownerId, policy, ev.receivedAt);
  if (rawEventId) {
    await updateRaw(ownerId, rawEventId, { status: 'parsed', reviewReason: '', detectedType: 'policy' }, { policy: JSON.parse(JSON.stringify(x)), policyId: String(policy._id) });
  }
  const label = `${policy.insurer}${policy.planName ? ` ${policy.planName}` : ''}${policy.vehicleNumber ? ` (${policy.vehicleNumber})` : ''}`;
  await raiseAlert(ownerId, {
    type: created ? 'policy_added' : 'policy_updated',
    title: created ? `New policy filed: ${label}` : `Policy updated: ${label}`,
    body: [policy.renewalDate && `Renews ${policy.renewalDate.toISOString().slice(0, 10)}`, policy.premiumPaise && `premium ${formatPaiseINR(policy.premiumPaise)}`, 'Tap to check the details.'].filter(Boolean).join(' · '),
    entity: { kind: 'policy', id: String(policy._id) },
    dedupeKey: `policy-filed:${policy._id}:${policy.renewalDate?.toISOString().slice(0, 10) || ''}`,
    email: true,
  });
  return { policy, created, extraction: x };
}

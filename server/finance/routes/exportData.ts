import { Router } from 'express';
import {
  Account, Alert, Category, Claim, Commitment, FinDocument, Holding, Person, Policy, RawEvent, Rule, SenderProfile, SplitTemplate, Statement, Transaction,
} from '../models';
import { handler, scoped } from '../lib/http';

const router = Router();

// GET /api/finance/export - everything the user owns, as JSON (a personal
// backup / to take the data elsewhere). Email bodies, file contents and the
// statement password are not included.
router.get('/', handler(async (req, res) => {
  const o = scoped(req);
  const [accounts, transactions, categories, rules, templates, statements, policies, people, claims, documents, commitments, alerts, senders, rawEvents, holdings] = await Promise.all([
    Account.find(o), Transaction.find(o), Category.find(o), Rule.find(o), SplitTemplate.find(o), Statement.find(o), Policy.find(o),
    Person.find(o), Claim.find(o), FinDocument.find(o), Commitment.find(o), Alert.find(o), SenderProfile.find(o),
    RawEvent.find(o).select('-bodyEnc'), Holding.find(o),
  ]);
  res.setHeader('Content-Disposition', `attachment; filename="tabby-finance-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({
    exportedAt: new Date().toISOString(), version: 1,
    accounts, transactions, categories, rules, splitTemplates: templates, statements, policies, people, claims,
    documents, commitments, alerts, senderProfiles: senders, rawEvents, holdings,
  });
}));

export default router;

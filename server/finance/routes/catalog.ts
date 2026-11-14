import { Router } from 'express';
import { Category, Rule, SplitTemplate, Transaction } from '../models';
import { handler, isObjectId, scoped, validate } from '../lib/http';
import {
  categoryCreate, categoryUpdate, categoryReorder, ruleCreate, ruleUpdate, splitTemplateCreate, splitTemplateUpdate,
} from '../validation/schemas';
import { ensureDefaultCategories } from '../services/categories';

export const categoriesRouter = Router();
export const rulesRouter = Router();
export const templatesRouter = Router();

const notFound = (res: any, what: string) => res.status(404).json({ error: `${what} not found` });

// ---------------------------------------------------------------- categories

categoriesRouter.get('/', handler(async (req, res) => {
  await ensureDefaultCategories(req.userId!);
  const categories = await Category.find(scoped(req)).sort({ parentId: 1, sortOrder: 1, name: 1 });
  res.json({ success: true, categories });
}));

categoriesRouter.post('/', handler(async (req, res) => {
  const body = validate(categoryCreate, req.body, res);
  if (!body) return;
  if (body.parentId && !(await Category.exists({ _id: body.parentId, ...scoped(req) }))) {
    res.status(400).json({ error: 'Parent category not found' });
    return;
  }
  const category = await Category.create({ ...body, ...scoped(req), isSystem: false });
  res.status(201).json({ success: true, category });
}));

categoriesRouter.post('/reorder', handler(async (req, res) => {
  const body = validate(categoryReorder, req.body, res);
  if (!body) return;
  await Promise.all(body.ids.map((id, i) => Category.updateOne({ _id: id, ...scoped(req) }, { $set: { sortOrder: i } })));
  res.json({ success: true });
}));

categoriesRouter.patch('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res, 'Category');
  const body = validate(categoryUpdate, req.body, res);
  if (!body) return;
  if (body.parentId === req.params.id) { res.status(400).json({ error: 'A category cannot be its own parent' }); return; }
  const category = await Category.findOneAndUpdate({ _id: req.params.id, ...scoped(req) }, { $set: body }, { returnDocument: 'after' });
  if (!category) return notFound(res, 'Category');
  res.json({ success: true, category });
}));

// Deleting a category moves its transactions (and sub-categories) up to the
// parent, or to "uncategorised" for a top-level category.
categoriesRouter.delete('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res, 'Category');
  const category = await Category.findOne({ _id: req.params.id, ...scoped(req) });
  if (!category) return notFound(res, 'Category');
  const replacement = category.parentId || null;
  const owner = scoped(req);
  await Transaction.updateMany({ ...owner, categoryId: category._id }, { $set: { categoryId: replacement } });
  await Transaction.updateMany({ ...owner, 'splits.categoryId': category._id }, { $set: { 'splits.$[s].categoryId': replacement } }, { arrayFilters: [{ 's.categoryId': category._id }] });
  await Category.updateMany({ ...owner, parentId: category._id }, { $set: { parentId: replacement } });
  await Rule.deleteMany({ ...owner, 'action.categoryId': category._id });
  await Category.deleteOne({ _id: category._id });
  res.json({ success: true });
}));

// ---------------------------------------------------------------- rules

rulesRouter.get('/', handler(async (req, res) => {
  const rules = await Rule.find(scoped(req)).sort({ priority: -1, updatedAt: -1 });
  res.json({ success: true, rules });
}));

rulesRouter.post('/', handler(async (req, res) => {
  const body = validate(ruleCreate, req.body, res);
  if (!body) return;
  const rule = await Rule.create({ ...body, ...scoped(req), createdFrom: 'manual' });
  res.status(201).json({ success: true, rule });
}));

rulesRouter.patch('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res, 'Rule');
  const body = validate(ruleUpdate, req.body, res);
  if (!body) return;
  const rule = await Rule.findOneAndUpdate({ _id: req.params.id, ...scoped(req) }, { $set: body }, { returnDocument: 'after' });
  if (!rule) return notFound(res, 'Rule');
  res.json({ success: true, rule });
}));

rulesRouter.delete('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res, 'Rule');
  await Rule.deleteOne({ _id: req.params.id, ...scoped(req) });
  res.json({ success: true });
}));

// ---------------------------------------------------------------- split templates

templatesRouter.get('/', handler(async (req, res) => {
  const templates = await SplitTemplate.find(scoped(req)).sort({ name: 1 });
  res.json({ success: true, templates });
}));

templatesRouter.post('/', handler(async (req, res) => {
  const body = validate(splitTemplateCreate, req.body, res);
  if (!body) return;
  const template = await SplitTemplate.create({ ...body, ...scoped(req) });
  res.status(201).json({ success: true, template });
}));

templatesRouter.patch('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res, 'Template');
  const body = validate(splitTemplateUpdate, req.body, res);
  if (!body) return;
  const template = await SplitTemplate.findOneAndUpdate({ _id: req.params.id, ...scoped(req) }, { $set: body }, { returnDocument: 'after' });
  if (!template) return notFound(res, 'Template');
  res.json({ success: true, template });
}));

templatesRouter.delete('/:id', handler(async (req, res) => {
  if (!isObjectId(req.params.id)) return notFound(res, 'Template');
  await SplitTemplate.deleteOne({ _id: req.params.id, ...scoped(req) });
  res.json({ success: true });
}));

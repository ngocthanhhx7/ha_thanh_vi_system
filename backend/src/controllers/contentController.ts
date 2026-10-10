import type { RequestHandler } from 'express';
import { contactSchema } from '../validators/content.js';
import type { ContactService } from '../services/contactService.js';
import type { ContentService } from '../services/contentService.js';

export function contentControllers(content: ContentService, contacts: ContactService) {
  const getContent: RequestHandler = async (_req, res, next) => {
    try {
      res.json(await content.getPublicContent());
    } catch (error) {
      next(error);
    }
  };
  const getProducts: RequestHandler = async (_req, res, next) => {
    try {
      res.json((await content.getPublicContent()).products);
    } catch (error) {
      next(error);
    }
  };
  const getProduct: RequestHandler = async (req, res, next) => {
    try {
      const found = (await content.getPublicContent()).products.find(
        (product) => product.slug === req.params.slug,
      );
      if (!found) {
        res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
        return;
      }
      res.json(found);
    } catch (error) {
      next(error);
    }
  };
  const createContact: RequestHandler = async (req, res, next) => {
    const parsed = contactSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: 'Thông tin liên hệ chưa hợp lệ. Vui lòng kiểm tra lại các trường bắt buộc.',
      });
      return;
    }
    try {
      await contacts.submit(parsed.data);
      res.status(201).json({ message: 'Cảm ơn bạn đã liên hệ Hà Thành Vị.' });
    } catch (error) {
      next(error);
    }
  };
  const getAdminContent: RequestHandler = async (_req, res, next) => {
    try {
      res.json(await content.getPublicContent());
    } catch (error) {
      next(error);
    }
  };
  const putAdminContent: RequestHandler = async (req, res, next) => {
    try {
      res.json(await content.replaceContent(req.body));
    } catch (error) {
      next(error);
    }
  };
  const patchAdminSite: RequestHandler = async (req, res, next) => {
    try {
      res.json(await content.updateSite(req.body));
    } catch (error) {
      next(error);
    }
  };
  return {
    getContent,
    getProducts,
    getProduct,
    createContact,
    getAdminContent,
    putAdminContent,
    patchAdminSite,
  };
}

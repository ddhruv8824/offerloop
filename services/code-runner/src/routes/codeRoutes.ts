import { Router } from 'express';
import * as codeController from '../controllers/codeController';

const router = Router();

router.get('/health', codeController.getHealth);
router.post('/run', codeController.runCode);
router.get('/problems', codeController.getProblems);
router.get('/problems/:fileSlug', codeController.getProblemDetail);

export default router;

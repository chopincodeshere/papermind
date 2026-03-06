import express from 'express';
import { me, signIn, signUp } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

router.post('/signup', signUp);
router.post('/signin', signIn);
router.get('/me', requireAuth, me);

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { SESSION_COOKIE } from '../config/cookies.js';
import { findSessionByToken } from '../services/authService.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import { createRateLimiter } from '../utils/rateLimit.js';
import { AppError } from '../utils/AppError.js';
import * as calls from '../services/privateCallsService.js';
const router=Router(), params=z.strictObject({id:z.uuid()});
const quota = createRateLimiter({max:8,windowMs:60000});
function limitCalls(req,res,next) {
  if (!quota(req.user.id)) { const error = new AppError(429,'RATE_LIMITED','Esperá antes de iniciar otra llamada'); error.retryAfter=quota.retryAfter(req.user.id); throw error; }
  next();
}
router.use(authenticate);
const session=async(req)=>(await findSessionByToken(req.cookies?.[SESSION_COOKIE]))?.id??null;
router.get('/current',async(req,res)=>res.json({llamada:await calls.currentPrivateCall(req.user.id)}));
router.post('/',limitCalls,validate({body:z.strictObject({idConversacion:z.number().int().positive(),video:z.boolean()})}),async(req,res)=>res.status(201).json({llamada:await calls.startPrivateCall(req.user,await session(req),req.validated.body)}));
router.post('/:id/accept',validate({params}),async(req,res)=>res.json({llamada:await calls.acceptPrivateCall(req.validated.params.id,req.user.id,await session(req))}));
router.post('/:id/end',validate({params}),async(req,res)=>{await calls.finishPrivateCall(req.validated.params.id,req.user.id);res.status(204).end();});
router.post('/:id/token',validate({params}),async(req,res)=>res.json(await calls.privateCallToken(req.validated.params.id,req.user,await session(req))));
export default router;

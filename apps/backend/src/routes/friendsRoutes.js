import { Router } from "express";
import { sendRequest } from "../controllers/friendsController.js";
import { authenticate } from "../middlewares/authenticate.js";
import { validate } from "../middlewares/validate.js";
import { sendRequestSchema } from "../validations/friendsValidation.js";

const router = Router();

//todas las rutas de /api/friends exigen sesion
router.use(authenticate);

//enviar solic amistad
router.post("/requests", validate({ body: sendRequestSchema }), sendRequest);

export default router;

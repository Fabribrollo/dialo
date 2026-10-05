import { Router } from "express";
import {
  acceptRequest,
  listFriends,
  listRequests,
  rejectRequest,
  removeFriend,
  sendRequest,
} from "../controllers/friendsController.js";
import { authenticate } from "../middlewares/authenticate.js";
import { validate } from "../middlewares/validate.js";
import {
  friendIdParamsSchema,
  listRequestsQuerySchema,
  requestIdParamsSchema,
  sendRequestSchema,
} from "../validations/friendsValidation.js";

const router = Router();

//todas las rutas de /api/friends exigen sesion
router.use(authenticate);

// Amigos
router.get("/", listFriends);
router.delete(
  "/:idUsuario",
  validate({ params: friendIdParamsSchema }),
  removeFriend,
);

// Solicitudes
router.get(
  "/requests",
  validate({ query: listRequestsQuerySchema }),
  listRequests,
);
router.post("/requests", validate({ body: sendRequestSchema }), sendRequest);
router.post(
  "/requests/:id/accept",
  validate({ params: requestIdParamsSchema }),
  acceptRequest,
);
router.post(
  "/requests/:id/reject",
  validate({ params: requestIdParamsSchema }),
  rejectRequest,
);

export default router;

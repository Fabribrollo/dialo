import { Router } from "express";
import { searchUsers } from "../controllers/friendsController.js";
import { authenticate } from "../middlewares/authenticate.js";
import { validate } from "../middlewares/validate.js";
import { searchQuerySchema } from "../validations/friendsValidation.js";

const router = Router();

// Se monta en /api/users/search (ver app.js). Exige sesion y valida q y limit.
router.get(
  "/",
  authenticate,
  validate({ query: searchQuerySchema }),
  searchUsers,
);

export default router;

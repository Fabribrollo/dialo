import { Router } from 'express';
import * as controller from '../controllers/rolesController.js';
import { validate } from '../middlewares/validate.js';
import { communityIdParamsSchema } from '../validations/communitiesValidation.js';
import { communityRoleParamsSchema, roleBodySchema } from '../validations/rolesValidation.js';

// Se monta bajo communitiesRoutes, después de authenticate.
const router = Router({ mergeParams: true });
router.get('/', validate({ params: communityIdParamsSchema }), controller.listRoles);
router.post('/', validate({ params: communityIdParamsSchema, body: roleBodySchema }), controller.createRole);
router.get('/:idRol', validate({ params: communityRoleParamsSchema }), controller.getRole);
router.patch('/:idRol', validate({ params: communityRoleParamsSchema, body: roleBodySchema }), controller.updateRole);
router.delete('/:idRol', validate({ params: communityRoleParamsSchema }), controller.deleteRole);
export default router;

export const permissionLabels={ESCRIBIR:'Escribir',HABLAR:'Hablar',CAMARA:'Activar cámara',PANTALLA:'Compartir pantalla',ELIMINAR_MENSAJES:'Eliminar mensajes ajenos',SILENCIAR:'Silenciar usuarios',GESTIONAR_CANALES:'Gestionar canales',EXPULSAR:'Expulsar usuarios'};
export const basePermissions=['ESCRIBIR','HABLAR','CAMARA','PANTALLA'];
export const specialPermissions=['ELIMINAR_MENSAJES','SILENCIAR','GESTIONAR_CANALES','EXPULSAR'];
export const hasCommunityPermission=(community,p)=>Boolean(['ADMIN','PROPIETARIO'].includes(community?.miRol)||community?.misPermisos?.includes(p));

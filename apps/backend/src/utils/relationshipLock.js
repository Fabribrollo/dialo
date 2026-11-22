// Orden único para serializar solicitudes, aceptación y bloqueo de un mismo par.
export async function lockRelationship(db,a,b){
 const [first,second]=[a,b].sort((x,y)=>x-y);
 await db.$executeRaw`SELECT pg_advisory_xact_lock(${first}::integer, ${second}::integer)`;
}

import { prisma } from "../src/prisma/client.js";
import { hashPassword } from "../src/utils/password.js";

// Datos de prueba de la Entrega 50%. Se puede correr varias veces:
// los usuarios seed_* se reutilizan y las comunidades "(seed)" se vuelven a crear.
const CONTRASENA = "seed12345";
const COMUNIDAD_PRIVADA = "Comunidad de prueba (seed)";
const COMUNIDAD_PUBLICA = "Comunidad publica (seed)";

const USUARIOS = [
  { clave: "ana", nombreVisible: "Ana (seed)" },
  { clave: "beto", nombreVisible: "Beto (seed)" },
  { clave: "carla", nombreVisible: "Carla (seed)" },
  { clave: "dario", nombreVisible: "Dario (seed)" },
  { clave: "eva", nombreVisible: "Eva (seed)" },
];

async function crearUsuarios() {
  const hashContrasena = await hashPassword(CONTRASENA);
  const ids = {};
  for (const { clave, nombreVisible } of USUARIOS) {
    const nombreUsuario = `seed_${clave}`;
    const usuario = await prisma.usuario.upsert({
      where: { nombreUsuario },
      update: {},
      create: {
        nombreUsuario,
        nombreVisible,
        correo: `${nombreUsuario}@seed.dialo`,
        hashContrasena,
      },
    });
    ids[clave] = usuario.id;
  }
  return ids;
}

// Comunidad privada con un canal de cada caso de acceso.
async function crearComunidadPrivada(u) {
  return prisma.$transaction(
    async (tx) => {
      const comunidad = await tx.comunidad.create({
        data: {
          nombre: COMUNIDAD_PRIVADA,
          tipo: "PRIVADA",
          membresias: {
            create: [
              { idUsuario: u.ana, rol: "PROPIETARIO" },
              { idUsuario: u.beto, rol: "ADMIN" },
              { idUsuario: u.carla, rol: "MODERADOR" },
              { idUsuario: u.dario, rol: "INTEGRANTE" },
              { idUsuario: u.eva, rol: "INTEGRANTE" },
            ],
          },
        },
      });
      const crearCanal = (datos) =>
        tx.canal.create({ data: { idComunidad: comunidad.id, ...datos } });

      // Publico: todos ven y escriben.
      const general = await crearCanal({ nombre: "general", posicion: 0 });

      // Solo lectura para integrantes; los moderadores escriben.
      await crearCanal({
        nombre: "anuncios",
        posicion: 1,
        privado: true,
        habilitacionesRol: {
          create: [
            { rol: "INTEGRANTE", permisos: ["VER"] },
            { rol: "MODERADOR", permisos: ["VER", "ESCRIBIR"] },
          ],
        },
      });

      // Solo moderadores (y admin/propietario, que siempre tienen acceso).
      await crearCanal({
        nombre: "moderacion",
        posicion: 2,
        privado: true,
        habilitacionesRol: {
          create: [{ rol: "MODERADOR", permisos: ["VER", "ESCRIBIR"] }],
        },
      });

      // Privado con un integrante habilitado por usuario: Dario entra, Eva no.
      const proyecto = await crearCanal({
        nombre: "proyecto",
        posicion: 3,
        privado: true,
      });
      await tx.canalUsuario.create({
        data: {
          idCanal: proyecto.id,
          idComunidad: comunidad.id,
          idUsuario: u.dario,
          permisos: ["VER", "ESCRIBIR"],
        },
      });

      // Voz: se configura, pero las llamadas son de F-10.
      await crearCanal({ nombre: "charla", tipo: "VOZ", posicion: 4 });

      await tx.mensaje.createMany({
        data: [
          {
            idCanal: general.id,
            idAutor: u.ana,
            contenido: "Bienvenidos a la comunidad de prueba",
          },
          { idCanal: general.id, idAutor: u.dario, contenido: "Hola a todos" },
        ],
      });

      await tx.invitacion.create({
        data: {
          idComunidad: comunidad.id,
          idCreador: u.ana,
          codigo: "seedprueba01",
          usosMaximos: 10,
        },
      });

      return comunidad;
    },
    { timeout: 20000 },
  );
}

async function crearComunidadPublica(u) {
  return prisma.comunidad.create({
    data: {
      nombre: COMUNIDAD_PUBLICA,
      tipo: "PUBLICA",
      membresias: {
        create: [
          { idUsuario: u.beto, rol: "PROPIETARIO" },
          { idUsuario: u.eva, rol: "INTEGRANTE" },
        ],
      },
      canales: { create: [{ nombre: "general", posicion: 0 }] },
    },
  });
}

async function main() {
  const u = await crearUsuarios();
  await prisma.comunidad.deleteMany({
    where: { nombre: { in: [COMUNIDAD_PRIVADA, COMUNIDAD_PUBLICA] } },
  });
  const privada = await crearComunidadPrivada(u);
  const publica = await crearComunidadPublica(u);
  console.log(
    `Seed listo: comunidad privada ${privada.id}, comunidad publica ${publica.id}, usuarios seed_ana a seed_eva`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

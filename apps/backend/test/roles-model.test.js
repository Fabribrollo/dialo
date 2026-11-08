import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { applyMigrations } from "./migrations.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    "Configura TEST_DATABASE_URL con una base PostgreSQL exclusiva de pruebas",
  );
const schema = `test_t28_${randomUUID().replaceAll("-", "")}`;
const isolated = new URL(databaseUrl);
isolated.searchParams.set("schema", schema);
if (!isolated.searchParams.has("connection_limit"))
  isolated.searchParams.set("connection_limit", "5");

const ANTERIOR = "20261019214923_comunidades_canales";
const admin = new PrismaClient({ datasourceUrl: databaseUrl });
const prisma = new PrismaClient({ datasourceUrl: isolated.href });
let ana, beto, cata, comunidad, canal, mensaje;

const usuario = (nombre) =>
  prisma.usuario.create({
    data: {
      nombreUsuario: nombre,
      nombreVisible: nombre,
      correo: `${nombre}@example.test`,
      hashContrasena: "x",
    },
  });
const rol = (idComunidad, nombre) =>
  prisma.rolPersonalizado.create({ data: { idComunidad, nombre } });
const asignar = (idComunidad, idUsuario, idRol) =>
  prisma.membresiaRol.create({ data: { idComunidad, idUsuario, idRol } });

before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  // Datos con el modelo del 50%, antes de la migracion de roles.
  await applyMigrations(admin, schema, { hasta: ANTERIOR });
  [ana, beto, cata] = [
    await usuario("ana"),
    await usuario("beto"),
    await usuario("cata"),
  ];
  comunidad = await prisma.comunidad.create({
    data: {
      nombre: "Previa",
      membresias: {
        create: [
          { idUsuario: ana.id, rol: "PROPIETARIO" },
          { idUsuario: beto.id, rol: "MODERADOR" },
          { idUsuario: cata.id },
        ],
      },
    },
  });
  canal = await prisma.canal.create({
    data: {
      idComunidad: comunidad.id,
      nombre: "avisos",
      privado: true,
      habilitacionesRol: { create: [{ rol: "INTEGRANTE", permisos: ["VER"] }] },
    },
  });
  await prisma.canalUsuario.create({
    data: {
      idCanal: canal.id,
      idComunidad: comunidad.id,
      idUsuario: cata.id,
      permisos: ["VER", "ESCRIBIR"],
    },
  });
  mensaje = await prisma.mensaje.create({
    data: { idCanal: canal.id, idAutor: ana.id, contenido: "Anterior" },
  });
  await applyMigrations(admin, schema, { desde: ANTERIOR });
});

after(async () => {
  await prisma.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});

test("la migracion conserva comunidades, mensajes y habilitaciones anteriores", async () => {
  assert.equal(
    (await prisma.comunidad.findUnique({ where: { id: comunidad.id } })).nombre,
    "Previa",
  );
  assert.equal(
    await prisma.membresia.count({ where: { idComunidad: comunidad.id } }),
    3,
  );
  assert.deepEqual(
    await prisma.canalRol.findMany({
      where: { idCanal: canal.id },
      select: { rol: true, permisos: true },
    }),
    [{ rol: "INTEGRANTE", permisos: ["VER"] }],
  );
  const grant = await prisma.canalUsuario.findUnique({
    where: { idCanal_idUsuario: { idCanal: canal.id, idUsuario: cata.id } },
  });
  assert.deepEqual(grant.permisos, ["VER", "ESCRIBIR"]);
  assert.equal(
    (await prisma.mensaje.findUnique({ where: { id: mensaje.id } })).contenido,
    "Anterior",
  );
});

test("una membresia admite varios roles de su comunidad y conserva su rol base", async () => {
  const lectores = await rol(comunidad.id, "Lectores");
  const editores = await rol(comunidad.id, "Editores");
  await asignar(comunidad.id, cata.id, lectores.id);
  await asignar(comunidad.id, cata.id, editores.id);
  assert.equal(
    await prisma.membresiaRol.count({
      where: { idComunidad: comunidad.id, idUsuario: cata.id },
    }),
    2,
  );
  await assert.rejects(asignar(comunidad.id, cata.id, lectores.id));
  const membresia = await prisma.membresia.findUnique({
    where: {
      idComunidad_idUsuario: { idComunidad: comunidad.id, idUsuario: cata.id },
    },
  });
  assert.equal(membresia.rol, "INTEGRANTE");
});

test("rechaza asignaciones y habilitaciones entre comunidades", async () => {
  const otra = await prisma.comunidad.create({
    data: {
      nombre: "Otra",
      membresias: { create: [{ idUsuario: beto.id, rol: "PROPIETARIO" }] },
    },
  });
  const ajeno = await rol(otra.id, "Ajeno");
  // Rol de otra comunidad asignado en esta.
  await assert.rejects(asignar(comunidad.id, beto.id, ajeno.id));
  // Cata no es integrante de la otra comunidad.
  await assert.rejects(asignar(otra.id, cata.id, ajeno.id));
  // Rol de otra comunidad en un canal de esta, declarado con cualquiera de las dos comunidades.
  await assert.rejects(
    prisma.canalRolPersonalizado.create({
      data: {
        idCanal: canal.id,
        idComunidad: comunidad.id,
        idRol: ajeno.id,
        permisos: ["VER"],
      },
    }),
  );
  await assert.rejects(
    prisma.canalRolPersonalizado.create({
      data: {
        idCanal: canal.id,
        idComunidad: otra.id,
        idRol: ajeno.id,
        permisos: ["VER"],
      },
    }),
  );
});

test("el nombre es unico por comunidad, sin distinguir mayusculas, y no repite roles base", async () => {
  const otra = await prisma.comunidad.create({ data: { nombre: "Tercera" } });
  await rol(comunidad.id, "Equipo");
  await assert.rejects(rol(comunidad.id, " equipo "));
  await rol(otra.id, "Equipo");
  for (const nombre of [
    "Admin",
    "propietario",
    " MODERADOR ",
    "Integrante",
    "   ",
  ])
    await assert.rejects(rol(comunidad.id, nombre));
});

test("una habilitacion de rol personalizado necesita permisos", async () => {
  const sinPermisos = await rol(comunidad.id, "Sin permisos");
  await assert.rejects(
    prisma.canalRolPersonalizado.create({
      data: {
        idCanal: canal.id,
        idComunidad: comunidad.id,
        idRol: sinPermisos.id,
        permisos: [],
      },
    }),
  );
  await prisma.canalRolPersonalizado.create({
    data: {
      idCanal: canal.id,
      idComunidad: comunidad.id,
      idRol: sinPermisos.id,
      permisos: ["VER"],
    },
  });
  await assert.rejects(
    prisma.canalRolPersonalizado.create({
      data: {
        idCanal: canal.id,
        idComunidad: comunidad.id,
        idRol: sinPermisos.id,
        permisos: ["VER"],
      },
    }),
  );
});

test("eliminar un rol limpia asignaciones y habilitaciones sin tocar integrantes, canales ni mensajes", async () => {
  const temporal = await rol(comunidad.id, "Temporal");
  await asignar(comunidad.id, beto.id, temporal.id);
  await prisma.canalRolPersonalizado.create({
    data: {
      idCanal: canal.id,
      idComunidad: comunidad.id,
      idRol: temporal.id,
      permisos: ["VER", "ESCRIBIR"],
    },
  });
  await prisma.rolPersonalizado.delete({ where: { id: temporal.id } });
  assert.equal(
    await prisma.membresiaRol.count({ where: { idRol: temporal.id } }),
    0,
  );
  assert.equal(
    await prisma.canalRolPersonalizado.count({ where: { idRol: temporal.id } }),
    0,
  );
  assert.equal(
    await prisma.membresia.count({ where: { idComunidad: comunidad.id } }),
    3,
  );
  assert.notEqual(
    await prisma.canal.findUnique({ where: { id: canal.id } }),
    null,
  );
  assert.notEqual(
    await prisma.mensaje.findUnique({ where: { id: mensaje.id } }),
    null,
  );
});

test("al dejar la comunidad se quitan sus roles personalizados y el rol sigue existiendo", async () => {
  const dani = await usuario("dani");
  await prisma.membresia.create({
    data: { idComunidad: comunidad.id, idUsuario: dani.id },
  });
  const visitas = await rol(comunidad.id, "Visitas");
  await asignar(comunidad.id, dani.id, visitas.id);
  await prisma.membresia.delete({
    where: {
      idComunidad_idUsuario: { idComunidad: comunidad.id, idUsuario: dani.id },
    },
  });
  assert.equal(
    await prisma.membresiaRol.count({ where: { idUsuario: dani.id } }),
    0,
  );
  assert.notEqual(
    await prisma.rolPersonalizado.findUnique({ where: { id: visitas.id } }),
    null,
  );
});

test("eliminar la comunidad elimina sus roles en cascada", async () => {
  const efimera = await prisma.comunidad.create({
    data: {
      nombre: "Efimera",
      membresias: { create: [{ idUsuario: ana.id, rol: "PROPIETARIO" }] },
    },
  });
  const r = await rol(efimera.id, "Pasajero");
  await asignar(efimera.id, ana.id, r.id);
  await prisma.comunidad.delete({ where: { id: efimera.id } });
  assert.equal(
    await prisma.rolPersonalizado.count({ where: { idComunidad: efimera.id } }),
    0,
  );
  assert.equal(
    await prisma.membresiaRol.count({ where: { idComunidad: efimera.id } }),
    0,
  );
});
